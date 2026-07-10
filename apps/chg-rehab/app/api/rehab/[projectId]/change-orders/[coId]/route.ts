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

  // Optional schedule impact in days (captured only — no schedule rewiring).
  if (body.daysDelta != null && body.daysDelta !== "") {
    const n = Number(body.daysDelta);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json(
        { error: "Schedule impact must be a whole number of days" },
        { status: 400 }
      );
    }
    data.daysDelta = n;
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

  // Phase.budget must always equal each phase's original budget plus the sum of
  // that phase's Approved change-order amounts. A CO contributes its amount to
  // its linked phase only while Approved; Pending/Rejected COs have no budget
  // effect. Rather than lock the record after approval, we reconcile with delta
  // adjustments: reverse this CO's *old* budget effect and apply its *new* one.
  // Edits to the amount, the linked job type, or the status therefore all keep
  // the invariant exactly, with no double-counting.
  const oldEffectivePhase = co.status === ChangeOrderStatus.Approved ? co.phaseId : null;
  const newEffectivePhase = nextStatus === ChangeOrderStatus.Approved ? nextPhaseId : null;
  const budgetDeltas = new Map<string, Prisma.Decimal>();
  const addDelta = (phaseId: string, amt: Prisma.Decimal) => {
    budgetDeltas.set(
      phaseId,
      (budgetDeltas.get(phaseId) ?? new Prisma.Decimal(0)).plus(amt)
    );
  };
  if (oldEffectivePhase) addDelta(oldEffectivePhase, co.amount.negated());
  if (newEffectivePhase) addDelta(newEffectivePhase, nextAmount);

  // Stamp the approver on the first transition into Approved (the existing
  // one-time fold behavior); clear the stamp when leaving Approved so a later
  // re-approval re-stamps cleanly. The budget increment itself is handled by
  // the delta map above, which is guarded against double-adding by design.
  const becomingApproved =
    nextStatus === ChangeOrderStatus.Approved && co.status !== ChangeOrderStatus.Approved;
  const leavingApproved =
    co.status === ChangeOrderStatus.Approved && nextStatus !== ChangeOrderStatus.Approved;
  if (becomingApproved) {
    data.approvedById = user.id;
    data.approvedAt = new Date();
  } else if (leavingApproved) {
    data.approvedById = null;
    data.approvedAt = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.changeOrder.update({
      where: { id: co.id },
      data,
    });
    for (const [phaseId, delta] of budgetDeltas) {
      if (delta.isZero()) continue;
      await tx.phase.updateMany({
        where: { id: phaseId, projectId: pid },
        data: { budget: { increment: delta } },
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
  const { projectId: pid, co } = resolved;

  // Deleting an Approved CO must first un-fold its amount from the linked phase
  // budget so the invariant (phase budget = original + Approved COs) holds.
  // Pending/Rejected COs have no budget effect, so they simply delete.
  const unfold =
    co.status === ChangeOrderStatus.Approved && co.phaseId
      ? { phaseId: co.phaseId, amount: co.amount }
      : null;

  await prisma.$transaction(async (tx) => {
    if (unfold) {
      await tx.phase.updateMany({
        where: { id: unfold.phaseId, projectId: pid },
        data: { budget: { decrement: unfold.amount } },
      });
    }
    await tx.changeOrder.delete({ where: { id: co.id } });
  });
  return NextResponse.json({ ok: true });
}
