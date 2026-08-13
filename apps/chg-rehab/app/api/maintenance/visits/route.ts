import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/visits — list visits (optional filters)
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const agreementId = url.searchParams.get("agreementId");
  const propertyId = url.searchParams.get("propertyId");

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (agreementId) where.agreementId = agreementId;
  if (propertyId) where.propertyId = propertyId;

  const visits = await prisma.maintenanceVisit.findMany({
    where,
    include: {
      property: { select: { id: true, code: true, address: true } },
      contact: { select: { id: true, name: true } },
      agreement: { select: { id: true, name: true } },
      workItems: true,
    },
    orderBy: { visitedAt: "desc" },
  });
  return NextResponse.json({ visits });
}

// POST /api/maintenance/visits — log a visit
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { propertyId, agreementId, contactId, reportId, visitedAt, tripNumber, description, isRepeatFix, workItems } = body;

  if (!propertyId || !agreementId || !contactId || !visitedAt || tripNumber == null) {
    return NextResponse.json({ error: "propertyId, agreementId, contactId, visitedAt, and tripNumber are required" }, { status: 400 });
  }

  // Validate ownership
  const [property, agreement, contact] = await Promise.all([
    prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId } }),
    prisma.maintenanceAgreement.findFirst({ where: { id: agreementId, companyId: user.companyId } }),
    prisma.contact.findFirst({ where: { id: contactId, companyId: user.companyId } }),
  ]);
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const visit = await prisma.maintenanceVisit.create({
    data: {
      companyId: user.companyId,
      propertyId,
      agreementId,
      contactId,
      reportId: reportId || null,
      visitedAt: new Date(visitedAt),
      tripNumber,
      description: description?.trim() || null,
      isRepeatFix: !!isRepeatFix,
      workItems: workItems?.length
        ? { create: workItems.map((wi: Record<string, unknown>) => ({
            description: wi.description,
            category: wi.category || "Repair",
            laborCost: wi.laborCost ?? null,
            materialCost: wi.materialCost ?? null,
            receiptUrl: wi.receiptUrl || null,
          })) }
        : undefined,
    },
    include: {
      property: { select: { id: true, code: true, address: true } },
      contact: { select: { id: true, name: true } },
      workItems: true,
    },
  });

  // If this visit was created from a report, mark the report as Converted
  if (reportId) {
    await prisma.maintenanceReport.updateMany({
      where: { id: reportId, companyId: user.companyId, status: { in: ["New", "Reviewed"] } },
      data: { status: "Converted", convertedToVisitId: visit.id },
    });
  }

  return NextResponse.json({ visit }, { status: 201 });
}
