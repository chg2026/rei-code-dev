import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJobTypes, parseStages } from "@/lib/rehab/invoice-utils";
import { recomputePhaseActuals } from "@/lib/rehab/invoiceActuals";
import {
  InvoiceClassification,
  InvoiceStatus,
  Prisma,
} from "@prisma/client";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = Object.values(InvoiceClassification);
const STATUSES = Object.values(InvoiceStatus);

/** Resolve an invoice that belongs to the user's company + the route project. */
async function resolveInvoice(
  projectIdOrCode: string,
  invoiceId: string,
  companyId: string
) {
  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) return null;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, projectId: project.id },
    select: { id: true },
  });
  if (!invoice) return null;
  return { projectId: project.id, invoiceId: invoice.id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invoiceId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId } = await params;
  const resolved = await resolveInvoice(
    decodeURIComponent(projectId),
    invoiceId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.InvoiceUpdateInput = {};

  if (typeof body.vendor === "string") {
    if (!body.vendor.trim()) {
      return NextResponse.json({ error: "Vendor cannot be empty" }, { status: 400 });
    }
    data.vendor = body.vendor.trim();
  }
  if ("invoiceNumber" in body) {
    data.invoiceNumber =
      typeof body.invoiceNumber === "string" && body.invoiceNumber.trim()
        ? body.invoiceNumber.trim()
        : null;
  }
  if ("notes" in body) {
    data.notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.date != null) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    data.date = date;
  }
  if (body.amount != null) {
    try {
      data.amount = new Prisma.Decimal(body.amount);
    } catch {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
  }
  if (body.classification != null) {
    if (!CLASSIFICATIONS.includes(body.classification)) {
      return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
    }
    data.classification = body.classification;
  }
  if (body.status != null) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  // Job types replace the legacy single phaseId. When supplied we delete the
  // existing rows and recreate them (delete + recreate on save).
  let parsedJobTypes: Awaited<ReturnType<typeof parseJobTypes>> | null = null;
  if ("jobTypes" in body) {
    parsedJobTypes = await parseJobTypes(body.jobTypes, resolved.projectId);
    if (!parsedJobTypes.ok) {
      return NextResponse.json({ error: parsedJobTypes.error }, { status: 400 });
    }
  }

  // Stages (payment schedule) — upsert by id, delete the ones that were removed,
  // and preserve paidAt on rows that stay Paid.
  let parsedStages: ReturnType<typeof parseStages> | null = null;
  if ("stages" in body) {
    parsedStages = parseStages(body.stages);
    if (!parsedStages.ok) {
      return NextResponse.json({ error: parsedStages.error }, { status: 400 });
    }
  }

  // Phases affected by this change = the existing rows' phases plus any new ones.
  const existing = await prisma.invoiceJobType.findMany({
    where: { invoiceId: resolved.invoiceId },
    select: { phaseId: true },
  });
  const affectedPhaseIds = new Set<string>();
  for (const r of existing) if (r.phaseId) affectedPhaseIds.add(r.phaseId);

  const invoice = await prisma.$transaction(async (tx) => {
    if (parsedJobTypes && parsedJobTypes.ok) {
      await tx.invoiceJobType.deleteMany({ where: { invoiceId: resolved.invoiceId } });
      for (const r of parsedJobTypes.rows) {
        await tx.invoiceJobType.create({
          data: {
            invoiceId: resolved.invoiceId,
            phaseId: r.phaseId,
            amount: r.amount,
            notes: r.notes,
          },
        });
        if (r.phaseId) affectedPhaseIds.add(r.phaseId);
      }
    }

    if (parsedStages && parsedStages.ok) {
      const existingStages = await tx.invoiceStage.findMany({
        where: { invoiceId: resolved.invoiceId },
      });
      const existingById = new Map(existingStages.map((s) => [s.id, s]));
      const keptIds = new Set(
        parsedStages.rows
          .filter((r) => r.id && existingById.has(r.id))
          .map((r) => r.id as string)
      );
      const removed = existingStages.filter((s) => !keptIds.has(s.id)).map((s) => s.id);
      if (removed.length) {
        await tx.invoiceStage.deleteMany({ where: { id: { in: removed } } });
      }
      let order = 0;
      for (const r of parsedStages.rows) {
        const prev = r.id ? existingById.get(r.id) : undefined;
        const paidAt =
          r.status === "Paid" ? prev?.paidAt ?? new Date() : null;
        const fields = {
          name: r.name,
          description: r.description,
          percentage: r.percentage,
          amount: r.amount,
          status: r.status,
          triggerEvent: r.triggerEvent,
          dueDate: r.dueDate,
          order: order++,
          paidAt,
        };
        if (prev) {
          await tx.invoiceStage.update({ where: { id: prev.id }, data: fields });
        } else {
          await tx.invoiceStage.create({
            data: { invoiceId: resolved.invoiceId, ...fields },
          });
        }
      }
    }

    return tx.invoice.update({
      where: { id: resolved.invoiceId },
      data,
      include: {
        attachments: { orderBy: { createdAt: "asc" } },
        jobTypes: { orderBy: { createdAt: "asc" } },
        stages: { orderBy: { order: "asc" } },
      },
    });
  });

  await recomputePhaseActuals(resolved.projectId, Array.from(affectedPhaseIds));

  return NextResponse.json({ invoice });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invoiceId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId } = await params;
  const resolved = await resolveInvoice(
    decodeURIComponent(projectId),
    invoiceId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jobTypes = await prisma.invoiceJobType.findMany({
    where: { invoiceId: resolved.invoiceId },
    select: { phaseId: true },
  });

  await prisma.invoice.delete({ where: { id: resolved.invoiceId } });

  await recomputePhaseActuals(
    resolved.projectId,
    jobTypes.map((j) => j.phaseId)
  );

  return NextResponse.json({ ok: true });
}
