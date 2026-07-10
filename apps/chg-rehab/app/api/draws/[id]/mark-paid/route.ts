import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { assertDrawPayable, PaymentGateError } from "@/lib/paymentGate";
import { DrawStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Mark an approved draw as Paid. This is the second step after release
 * (approval): in strict payment mode a signed lien waiver must be on file
 * (assertDrawPayable). Only a draw already in Approved status can be paid.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "draws", "approve"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const draw = await prisma.draw.findFirst({
    where: { id, project: { companyId: user.companyId } },
    select: { id: true, number: true, status: true, amount: true, projectId: true, lienWaiverReceived: true },
  });
  if (!draw) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

  if (draw.status !== DrawStatus.Approved) {
    return NextResponse.json(
      { error: "Only an approved (released) draw can be marked paid." },
      { status: 409 }
    );
  }

  try {
    await assertDrawPayable(user.companyId, { lienWaiverReceived: draw.lienWaiverReceived });
  } catch (e) {
    if (e instanceof PaymentGateError) {
      return NextResponse.json(
        { error: e.message, reasons: e.reasons, code: "STRICT_PAYMENT_GATE" },
        { status: 412 }
      );
    }
    throw e;
  }

  const paidAt = new Date();
  const updated = await prisma.draw.update({
    where: { id: draw.id },
    data: { status: DrawStatus.Paid, paidAt },
    select: { id: true, status: true, paidAt: true },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw.paid",
      entity: "Draw",
      entityId: draw.id,
      message: `Draw #${draw.number} marked paid — $${Number(draw.amount).toLocaleString()}.`,
      meta: {
        type: "payment",
        drawId: draw.id,
        drawNumber: draw.number,
        amount: Number(draw.amount),
        projectId: draw.projectId,
        paidAt: paidAt.toISOString(),
      },
    },
  });

  return NextResponse.json({ ok: true, draw: updated });
}
