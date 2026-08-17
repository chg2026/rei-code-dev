import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Rental properties
  const rentalProperties = await prisma.property.findMany({
    where: {
      companyId: user.companyId,
      status: { in: ["rental", "Rental"], not: null },
    },
    select: { id: true, code: true, address: true, city: true, state: true, status: true },
  });

  // All company leases
  const leases = await prisma.lease.findMany({
    where: { companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      payments: {
        select: { amount: true, period: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 12,
      },
    },
  });

  // Lease stats
  const activeLeases = leases.filter((l) => l.status === "Active");
  const occupied = activeLeases.length;

  // Monthly rent roll
  const monthlyRentRoll = activeLeases.reduce(
    (sum, l) => sum + (Number(l.rent) || 0),
    0
  );

  // Rent collected this month
  let collectedThisMonth = 0;
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const lease of leases) {
    for (const p of lease.payments) {
      if (p.period === currentPeriod) {
        collectedThisMonth += Number(p.amount);
        break; // one payment per period (unique constraint)
      }
    }
  }

  // Outstanding rent (rent due for months not yet paid this year)
  let outstanding = 0;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  for (const lease of activeLeases) {
    if (!lease.startDate) continue;
    const leaseStart = new Date(Math.max(lease.startDate.getTime(), yearStart.getTime()));
    let cursor = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
    while (cursor < now) {
      const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const paid = lease.payments.some((p) => p.period === period);
      if (!paid) {
        outstanding += Number(lease.rent) || 0;
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  // Total deposits held
  const totalDeposits = leases.reduce(
    (sum, l) => sum + (Number(l.securityDeposit) || 0),
    0
  );

  // Upcoming expirations (next 60 days)
  const upcomingExpirations = leases
    .filter((l) => l.status === "Active" && l.endDate && l.endDate >= now && l.endDate <= sixtyDaysOut)
    .sort((a, b) => (a.endDate!.getTime() - b.endDate!.getTime()))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      tenantName: l.tenantName,
      propertyCode: l.property?.code ?? null,
      propertyAddress: l.property?.address ?? null,
      endDate: l.endDate,
      rent: Number(l.rent) || 0,
    }));

  // Recent payments
  const recentPayments = await prisma.rentPayment.findMany({
    where: { companyId: user.companyId },
    include: {
      lease: {
        select: {
          tenantName: true,
          property: { select: { code: true, address: true } },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    properties: {
      total: rentalProperties.length,
      occupied,
      vacant: rentalProperties.length - occupied,
    },
    rent: {
      monthlyRoll: monthlyRentRoll,
      collectedThisMonth,
      outstanding,
    },
    depositsHeld: totalDeposits,
    upcomingExpirations,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      leaseId: p.leaseId,
      tenantName: p.lease.tenantName,
      propertyCode: p.lease.property?.code ?? null,
      propertyAddress: p.lease.property?.address ?? null,
      amount: Number(p.amount),
      period: p.period,
      receivedAt: p.receivedAt,
      method: p.method,
    })),
  });
}