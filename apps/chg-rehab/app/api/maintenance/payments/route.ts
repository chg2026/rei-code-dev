import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/maintenance/payments — list payments
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const agreementId = url.searchParams.get("agreementId");

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (agreementId) where.agreementId = agreementId;

  const payments = await prisma.maintenancePayment.findMany({
    where,
    include: { agreement: { select: { id: true, name: true } } },
    orderBy: { paidAt: "desc" },
  });
  return NextResponse.json({ payments });
}

// POST /api/maintenance/payments — record a payment
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { agreementId, amount, paidAt, period, notes } = body;

  if (!agreementId || amount == null || !paidAt || !period) {
    return NextResponse.json({ error: "agreementId, amount, paidAt, and period are required" }, { status: 400 });
  }

  const agreement = await prisma.maintenanceAgreement.findFirst({
    where: { id: agreementId, companyId: user.companyId },
  });
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  const payment = await prisma.maintenancePayment.create({
    data: {
      companyId: user.companyId,
      agreementId,
      amount,
      paidAt: new Date(paidAt),
      period: period.trim(),
      notes: notes?.trim() || null,
    },
    include: { agreement: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ payment }, { status: 201 });
}
