import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangeOrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(ChangeOrderStatus);

/** Resolve a change order scoped to the user's company + the route project. */
async function resolveChangeOrder(
  projectIdOrCode: string,
  coId: string,
  companyId: string
) {
  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) return null;
  const co = await prisma.changeOrder.findFirst({
    where: { id: coId, projectId: project.id },
  });
  if (!co) return null;
  return { projectId: project.id, co };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; coId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, coId } = await params;
  const resolved = await resolveChangeOrder(
    decodeURIComponent(projectId),
    coId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { projectId: pid, co } = resolved;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.ChangeOrderUpdateInput = {};

  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    data.title = body.title.trim();
  }
  if ("reason" in body) {
    data.reason =
      typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  }

  let nextAmount = co.amount;
  if (body.amount != null) {
    try {
      nextAmount = new Prisma.Decimal(body.amount);
    } catch {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    data.amount = nextAmount;
  }

  let nextPhaseId = co.phaseId;
  if ("phaseId" in body) {
    if (typeof body.phaseId === "string" && body.phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: body.phaseId, projectId: pid },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      nextPhaseId = phase.id;
    } else {
      nextPhaseId = null;
    }
    data.phaseId = nextPhaseId;
  }

  let nextStatus = co.status;
  if (body.status != null) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    nextStatus = body.status;
    data.status = nextStatus;
  }

  // Once a change order is Approved its amount has already been folded into the
  // linked phase budget. Editing the amount/phase or rolling the status back
  // would silently desync Phase.budget, so financial fields are locked after
  // approval (mirrors the "only Pending can be deleted" rule). Non-financial
  // fields (title, reason) stay editable.
  if (co.status === ChangeOrderStatus.Approved) {
    const amountChanged = !nextAmount.equals(co.amount);
    const phaseChanged = nextPhaseId !== co.phaseId;
    const statusChanged = nextStatus !== co.status;
    if (amountChanged || phaseChanged || statusChanged) {
      return NextResponse.json(
        {
          error:
            "An approved change order's amount, phase, and status are locked because its budget impact has already been applied.",
        },
        { status: 409 }
      );
    }
  }

  // Approval transition: stamp approver + fold the change amount into the
  // linked phase's budget. Only on the first transition into Approved so the
  // budget is never incremented twice.
  const becomingApproved =
    nextStatus === ChangeOrderStatus.Approved && co.status !== ChangeOrderStatus.Approved;
  if (becomingApproved) {
    data.approvedById = user.id;
    data.approvedAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.changeOrder.update({
      where: { id: co.id },
      data,
    });
    if (becomingApproved && nextPhaseId) {
      await tx.phase.update({
        where: { id: nextPhaseId },
        data: { budget: { increment: nextAmount } },
      });
    }
    return result;
  });

  return NextResponse.json({ changeOrder: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; coId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, coId } = await params;
  const resolved = await resolveChangeOrder(
    decodeURIComponent(projectId),
    coId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (resolved.co.status !== ChangeOrderStatus.Pending) {
    return NextResponse.json(
      { error: "Only pending change orders can be deleted" },
      { status: 409 }
    );
  }

  await prisma.changeOrder.delete({ where: { id: resolved.co.id } });
  return NextResponse.json({ ok: true });
}
