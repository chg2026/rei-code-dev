import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const leaseId = searchParams.get("leaseId");
  const propertyId = searchParams.get("propertyId");

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (leaseId) where.leaseId = leaseId;

  const payments = await prisma.rentPayment.findMany({
    where: where as any,
    include: {
      lease: {
        select: {
          id: true,
          tenantName: true,
          propertyId: true,
          property: { select: { id: true, code: true, address: true } },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
  });

  let filtered = payments;
  if (propertyId) {
    filtered = payments.filter((p) => p.lease.propertyId === propertyId);
  }

  return NextResponse.json({
    payments: filtered.map((p) => ({
      id: p.id,
      leaseId: p.leaseId,
      tenantName: p.lease.tenantName,
      propertyCode: p.lease.property?.code ?? null,
      propertyAddress: p.lease.property?.address ?? null,
      amount: Number(p.amount),
      period: p.period,
      receivedAt: p.receivedAt,
      method: p.method,
      notes: p.notes,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));

  const leaseId = (body.leaseId as string)?.trim();
  const amount = body.amount != null ? Number(body.amount) : null;
  const period = (body.period as string)?.trim();

  if (!leaseId) {
    return NextResponse.json({ error: "leaseId is required" }, { status: 400 });
  }
  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  if (!period) {
    return NextResponse.json({ error: "period is required (YYYY-MM)" }, { status: 400 });
  }

  // Verify lease belongs to company
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, companyId: user.companyId },
  });
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  // Check for duplicate (unique constraint on leaseId + period)
  const existing = await prisma.rentPayment.findUnique({
    where: { leaseId_period: { leaseId, period } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Payment already recorded for period ${period}`, id: existing.id },
      { status: 409 }
    );
  }

  const payment = await prisma.rentPayment.create({
    data: {
      companyId: user.companyId,
      leaseId,
      amount,
      period,
      receivedAt: body.receivedAt ? new Date(body.receivedAt as string) : new Date(),
      method: (body.method as string)?.trim() || null,
      notes: (body.notes as string)?.trim() || null,
    },
  });

  return NextResponse.json(
    {
      id: payment.id,
      leaseId: payment.leaseId,
      amount: Number(payment.amount),
      period: payment.period,
      receivedAt: payment.receivedAt,
      method: payment.method,
      notes: payment.notes,
    },
    { status: 201 }
  );
}