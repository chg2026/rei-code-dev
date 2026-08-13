import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/reports/[id]
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const report = await prisma.maintenanceReport.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      convertedToVisit: { select: { id: true, visitedAt: true, status: true, tripNumber: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  return NextResponse.json({ report });
}

// PATCH /api/maintenance/reports/[id] — update (review, change priority, convert)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceReport.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.status !== undefined) data.status = body.status;
  if (body.description !== undefined) data.description = body.description?.trim();
  if (body.convertedToVisitId !== undefined) data.convertedToVisitId = body.convertedToVisitId || null;

  const report = await prisma.maintenanceReport.update({
    where: { id },
    data,
    include: {
      property: { select: { id: true, code: true, address: true } },
      convertedToVisit: { select: { id: true, visitedAt: true, status: true } },
    },
  });
  return NextResponse.json({ report });
}

// DELETE /api/maintenance/reports/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.maintenanceReport.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  await prisma.maintenanceReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
