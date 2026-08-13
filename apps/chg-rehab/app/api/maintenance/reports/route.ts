import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/reports — list reports
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const propertyId = url.searchParams.get("propertyId");

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;

  const reports = await prisma.maintenanceReport.findMany({
    where,
    include: {
      property: { select: { id: true, code: true, address: true } },
      convertedToVisit: { select: { id: true, visitedAt: true, status: true } },
    },
    orderBy: { reportedAt: "desc" },
  });
  return NextResponse.json({ reports });
}

// POST /api/maintenance/reports — log a new report
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { propertyId, reportedBy, description, priority } = body;

  if (!propertyId || !description) {
    return NextResponse.json({ error: "propertyId and description are required" }, { status: 400 });
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, companyId: user.companyId },
  });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const report = await prisma.maintenanceReport.create({
    data: {
      companyId: user.companyId,
      propertyId,
      reportedBy: reportedBy?.trim() || null,
      description: description.trim(),
      priority: priority || "Medium",
    },
    include: { property: { select: { id: true, code: true, address: true } } },
  });
  return NextResponse.json({ report }, { status: 201 });
}
