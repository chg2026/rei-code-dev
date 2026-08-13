import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/agreements — list agreements for the company
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agreements = await prisma.maintenanceAgreement.findMany({
    where: { companyId: user.companyId },
    include: { contact: { select: { id: true, name: true } }, _count: { select: { visits: true, payments: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ agreements });
}

// POST /api/maintenance/agreements — create a new agreement
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { contactId, name, retainerAmount, tripsPerMonth, startDate, endDate, notes } = body;

  if (!contactId || !name || retainerAmount == null || !startDate) {
    return NextResponse.json({ error: "contactId, name, retainerAmount, and startDate are required" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: user.companyId },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const agreement = await prisma.maintenanceAgreement.create({
    data: {
      companyId: user.companyId,
      contactId,
      name: name.trim(),
      retainerAmount,
      tripsPerMonth: tripsPerMonth ?? 3,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      notes: notes?.trim() || null,
    },
    include: { contact: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ agreement }, { status: 201 });
}
