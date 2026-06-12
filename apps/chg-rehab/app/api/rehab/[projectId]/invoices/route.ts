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
    include: { attachments: { orderBy: { createdAt: "asc" } } },
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

  // phaseId, when supplied, must belong to this project.
  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    phaseId = phase.id;
  }

  const invoice = await prisma.invoice.create({
    data: {
      projectId: project.id,
      phaseId,
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
    },
    include: { attachments: true },
  });
  return NextResponse.json({ invoice }, { status: 201 });
}
