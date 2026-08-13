import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/agreements/[id] — single agreement with visits and payments
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const agreement = await prisma.maintenanceAgreement.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      contact: { select: { id: true, name: true, phone: true, email: true } },
      visits: { include: { property: { select: { id: true, code: true, address: true } }, workItems: true }, orderBy: { visitedAt: "desc" } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  return NextResponse.json({ agreement });
}

// PATCH /api/maintenance/agreements/[id] — update agreement
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceAgreement.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name?.trim();
  if (body.retainerAmount !== undefined) data.retainerAmount = body.retainerAmount;
  if (body.tripsPerMonth !== undefined) data.tripsPerMonth = body.tripsPerMonth;
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

  const agreement = await prisma.maintenanceAgreement.update({
    where: { id },
    data,
    include: { contact: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ agreement });
}

// DELETE /api/maintenance/agreements/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceAgreement.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  await prisma.maintenanceAgreement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
