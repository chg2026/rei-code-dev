import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { DrawStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

function projectDraw(d: {
  id: string;
  phaseId: string | null;
  number: number;
  title: string;
  amount: Prisma.Decimal;
  retainagePct: Prisma.Decimal;
  status: DrawStatus;
  notes: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  approvedById: string | null;
  lienWaiverDocId: string | null;
  lienWaiverReceived: boolean;
}) {
  return {
    id: d.id,
    phaseId: d.phaseId,
    number: d.number,
    title: d.title,
    amount: Number(d.amount),
    retainagePct: Number(d.retainagePct),
    status: d.status,
    notes: d.notes,
    approvedAt: d.approvedAt ? d.approvedAt.toISOString() : null,
    paidAt: d.paidAt ? d.paidAt.toISOString() : null,
    approvedById: d.approvedById,
    lienWaiverDocId: d.lienWaiverDocId,
    lienWaiverReceived: d.lienWaiverReceived,
  };
}

/**
 * Create a Draw for a phase (job type). One draw per phase is supported by the
 * gate (getPhaseGate uses findFirst / p.draws[0]), so this rejects a second
 * draw. Amount and retainage are validated; retainage/net are display-only and
 * never mutate the amount or any budget actual.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "draws", "approve"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const phaseId = typeof body.phaseId === "string" ? body.phaseId : "";
  if (!phaseId) return NextResponse.json({ error: "phaseId is required" }, { status: 400 });

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: { id: true, number: true, name: true },
  });
  if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(body.amount as Prisma.Decimal.Value);
  } catch {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  let retainagePct: Prisma.Decimal;
  try {
    retainagePct =
      body.retainagePct === null || body.retainagePct === undefined || body.retainagePct === ""
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(body.retainagePct as Prisma.Decimal.Value);
  } catch {
    return NextResponse.json({ error: "Invalid retainage percentage" }, { status: 400 });
  }
  if (!retainagePct.isFinite() || retainagePct.lessThan(0) || retainagePct.greaterThan(100)) {
    return NextResponse.json({ error: "Retainage must be between 0 and 100" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `Draw — Job Type ${phase.number}: ${phase.name}`;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  let draw;
  try {
    draw = await prisma.$transaction(async (tx) => {
      const dup = await tx.draw.findFirst({ where: { phaseId: phase.id }, select: { id: true } });
      if (dup) throw new Error("DRAW_EXISTS");
      const agg = await tx.draw.aggregate({
        where: { projectId: project.id },
        _max: { number: true },
      });
      const nextNumber = (agg._max.number ?? 0) + 1;
      return tx.draw.create({
        data: {
          projectId: project.id,
          phaseId: phase.id,
          number: nextNumber,
          title,
          amount,
          retainagePct,
          notes,
          status: DrawStatus.Pending,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "DRAW_EXISTS") {
      return NextResponse.json(
        { error: "This job type already has a draw. Edit or release the existing draw instead." },
        { status: 409 }
      );
    }
    throw e;
  }

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw.created",
      entity: "Draw",
      entityId: draw.id,
      message: `Draw #${draw.number} created — $${Number(draw.amount).toLocaleString()} for Job Type ${phase.number}: ${phase.name}.`,
      meta: {
        type: "payment",
        drawNumber: draw.number,
        drawId: draw.id,
        amount: Number(draw.amount),
        phaseId: phase.id,
        phaseNumber: phase.number,
        projectId: project.id,
      },
    },
  });

  return NextResponse.json({ draw: projectDraw(draw) }, { status: 201 });
}
