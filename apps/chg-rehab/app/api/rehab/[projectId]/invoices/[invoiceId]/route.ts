import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  if ("phaseId" in body) {
    if (typeof body.phaseId === "string" && body.phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: body.phaseId, projectId: resolved.projectId },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      data.phaseId = phase.id;
    } else {
      data.phaseId = null;
    }
  }

  const invoice = await prisma.invoice.update({
    where: { id: resolved.invoiceId },
    data,
    include: { attachments: { orderBy: { createdAt: "asc" } } },
  });
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

  await prisma.invoice.delete({ where: { id: resolved.invoiceId } });
  return NextResponse.json({ ok: true });
}
