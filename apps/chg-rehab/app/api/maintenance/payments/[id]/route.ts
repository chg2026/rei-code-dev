import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/maintenance/payments/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.maintenancePayment.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.paidAt !== undefined) data.paidAt = new Date(body.paidAt);
  if (body.period !== undefined) data.period = body.period?.trim();
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

  const payment = await prisma.maintenancePayment.update({
    where: { id },
    data,
    include: { agreement: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ payment });
}

// DELETE /api/maintenance/payments/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.maintenancePayment.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  await prisma.maintenancePayment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
