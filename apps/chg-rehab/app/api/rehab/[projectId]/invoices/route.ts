import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputePhaseActuals } from "@/lib/rehab/invoiceActuals";
import {
  InvoiceClassification,
  InvoiceStatus,
  Prisma,
} from "@prisma/client";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = Object.values(InvoiceClassification);
const STATUSES = Object.values(InvoiceStatus);

export type ParsedJobType = {
  phaseId: string | null;
  amount: Prisma.Decimal;
  notes: string | null;
};

/**
 * Validate the `jobTypes` payload. Each row carries an optional phase (job
 * type), a required amount, and optional notes. Phase ids must belong to the
 * project. Returns either the parsed rows or an error message.
 */
export async function parseJobTypes(
  raw: unknown,
  projectId: string
): Promise<{ ok: true; rows: ParsedJobType[] } | { ok: false; error: string }> {
  if (raw == null) return { ok: true, rows: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "jobTypes must be an array" };

  const validPhaseIds = new Set(
    (
      await prisma.phase.findMany({
        where: { projectId },
        select: { id: true },
      })
    ).map((p) => p.id)
  );

  const rows: ParsedJobType[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid job type row" };
    }
    const rec = item as Record<string, unknown>;
    let phaseId: string | null = null;
    if (typeof rec.phaseId === "string" && rec.phaseId) {
      if (!validPhaseIds.has(rec.phaseId)) {
        return { ok: false, error: "Invalid job type" };
      }
      phaseId = rec.phaseId;
    }
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(rec.amount as Prisma.Decimal.Value);
    } catch {
      return { ok: false, error: "A valid amount is required for each job type" };
    }
    const notes =
      typeof rec.notes === "string" && rec.notes.trim() ? rec.notes.trim() : null;
    rows.push({ phaseId, amount, notes });
  }
  return { ok: true, rows };
}

/**
 * Resolve a project the current user is allowed to see. The route param holds
 * either the project `code` (how the Rehab UI links) or the raw `id`; either
 * resolves, always scoped to the user's company.
 */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoices = await prisma.invoice.findMany({
    where: { projectId: project.id },
    include: {
      attachments: { orderBy: { createdAt: "asc" } },
      jobTypes: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ invoices });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  if (!vendor) return NextResponse.json({ error: "Vendor is required" }, { status: 400 });

  const date = body.date ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(body.amount);
  } catch {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }

  const classification: InvoiceClassification = CLASSIFICATIONS.includes(body.classification)
    ? body.classification
    : InvoiceClassification.Other;
  const status: InvoiceStatus = STATUSES.includes(body.status)
    ? body.status
    : InvoiceStatus.Unpaid;

  const parsed = await parseJobTypes(body.jobTypes, project.id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const invoice = await prisma.invoice.create({
    data: {
      projectId: project.id,
      vendor,
      invoiceNumber:
        typeof body.invoiceNumber === "string" && body.invoiceNumber.trim()
          ? body.invoiceNumber.trim()
          : null,
      date,
      amount,
      classification,
      status,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      jobTypes: {
        create: parsed.rows.map((r) => ({
          phaseId: r.phaseId,
          amount: r.amount,
          notes: r.notes,
        })),
      },
    },
    include: {
      attachments: true,
      jobTypes: { orderBy: { createdAt: "asc" } },
    },
  });

  await recomputePhaseActuals(
    project.id,
    parsed.rows.map((r) => r.phaseId)
  );

  return NextResponse.json({ invoice }, { status: 201 });
}
