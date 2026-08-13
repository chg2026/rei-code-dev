import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/visits/[id]
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const visit = await prisma.maintenanceVisit.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      contact: { select: { id: true, name: true } },
      agreement: { select: { id: true, name: true } },
      workItems: true,
      report: { select: { id: true, description: true, priority: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  return NextResponse.json({ visit });
}

// PATCH /api/maintenance/visits/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceVisit.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.visitedAt !== undefined) data.visitedAt = new Date(body.visitedAt);
  if (body.tripNumber !== undefined) data.tripNumber = body.tripNumber;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.laborCostTotal !== undefined) data.laborCostTotal = body.laborCostTotal;
  if (body.materialCostTotal !== undefined) data.materialCostTotal = body.materialCostTotal;
  if (body.isRepeatFix !== undefined) data.isRepeatFix = body.isRepeatFix;

  const visit = await prisma.maintenanceVisit.update({
    where: { id },
    data,
    include: { property: { select: { id: true, code: true, address: true } }, workItems: true },
  });
  return NextResponse.json({ visit });
}

// DELETE /api/maintenance/visits/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceVisit.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  await prisma.maintenanceVisit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
