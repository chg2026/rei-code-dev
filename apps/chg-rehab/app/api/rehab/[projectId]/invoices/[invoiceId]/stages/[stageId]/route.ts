import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputePhaseActuals } from "@/lib/rehab/invoiceActuals";
import { InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a stage that belongs to the user's company + route project + invoice. */
async function resolveStage(
  projectIdOrCode: string,
  invoiceId: string,
  stageId: string,
  companyId: string
) {
  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) return null;
  const stage = await prisma.invoiceStage.findFirst({
    where: { id: stageId, invoiceId, invoice: { projectId: project.id } },
    select: { id: true, invoiceId: true },
  });
  if (!stage) return null;
  return { projectId: project.id, invoiceId: stage.invoiceId, stageId: stage.id };
}

/**
 * Flip a single payment stage between Pending and Paid. Marking Paid stamps
 * paidAt. Invoice status tracks the schedule symmetrically: when every stage is
 * Paid the invoice becomes Paid, and as soon as any stage is Pending a
 * previously-Paid invoice is demoted back to Pending. Either way we recompute
 * the affected phases' actuals.
 */
export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; invoiceId: string; stageId: string }>;
  }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId, stageId } = await params;
  const resolved = await resolveStage(
    decodeURIComponent(projectId),
    invoiceId,
    stageId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const nextStatus = body && body.status === "Paid" ? "Paid" : "Pending";

  await prisma.invoiceStage.update({
    where: { id: resolved.stageId },
    data: {
      status: nextStatus,
      paidAt: nextStatus === "Paid" ? new Date() : null,
    },
  });

  // Keep the invoice status in sync with the schedule, both ways: all stages
  // Paid -> invoice Paid; any stage Pending -> a Paid invoice is demoted back to
  // Pending so it can never appear settled while money is still outstanding.
  const stages = await prisma.invoiceStage.findMany({
    where: { invoiceId: resolved.invoiceId },
    select: { status: true },
  });
  const allPaid = stages.length > 0 && stages.every((s) => s.status === "Paid");
  const current = await prisma.invoice.findUnique({
    where: { id: resolved.invoiceId },
    select: { status: true },
  });
  if (allPaid && current?.status !== InvoiceStatus.Paid) {
    await prisma.invoice.update({
      where: { id: resolved.invoiceId },
      data: { status: InvoiceStatus.Paid },
    });
  } else if (!allPaid && current?.status === InvoiceStatus.Paid) {
    await prisma.invoice.update({
      where: { id: resolved.invoiceId },
      data: { status: InvoiceStatus.Pending },
    });
  }

  const jobTypes = await prisma.invoiceJobType.findMany({
    where: { invoiceId: resolved.invoiceId },
    select: { phaseId: true },
  });
  await recomputePhaseActuals(
    resolved.projectId,
    jobTypes.map((j) => j.phaseId)
  );

  const invoice = await prisma.invoice.findUnique({
    where: { id: resolved.invoiceId },
    include: {
      attachments: { orderBy: { createdAt: "asc" } },
      jobTypes: { orderBy: { createdAt: "asc" } },
      stages: { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json({ invoice });
}
