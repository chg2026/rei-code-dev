import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/maintenance/work-items/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const item = await prisma.maintenanceWorkItem.findFirst({
    where: { id },
    include: { visit: { select: { companyId: true } } },
  });
  if (!item || item.visit.companyId !== user.companyId) {
    return NextResponse.json({ error: "Work item not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.description !== undefined) data.description = body.description?.trim();
  if (body.category !== undefined) data.category = body.category;
  if (body.laborCost !== undefined) data.laborCost = body.laborCost;
  if (body.materialCost !== undefined) data.materialCost = body.materialCost;
  if (body.receiptUrl !== undefined) data.receiptUrl = body.receiptUrl || null;

  const updated = await prisma.maintenanceWorkItem.update({ where: { id }, data });
  return NextResponse.json({ workItem: updated });
}

// DELETE /api/maintenance/work-items/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const item = await prisma.maintenanceWorkItem.findFirst({
    where: { id },
    include: { visit: { select: { companyId: true } } },
  });
  if (!item || item.visit.companyId !== user.companyId) {
    return NextResponse.json({ error: "Work item not found" }, { status: 404 });
  }

  await prisma.maintenanceWorkItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
