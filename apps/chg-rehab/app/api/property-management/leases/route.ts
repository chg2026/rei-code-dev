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
  const propertyId = searchParams.get("propertyId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (propertyId) where.propertyId = propertyId;
  if (status) where.status = status;

  const leases = await prisma.lease.findMany({
    where: where as any,
    include: {
      property: { select: { id: true, code: true, address: true } },
      payments: {
        select: { amount: true, period: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 12,
      },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({
    leases: leases.map((l) => ({
      id: l.id,
      propertyId: l.propertyId,
      propertyCode: l.property?.code ?? null,
      propertyAddress: l.property?.address ?? null,
      tenantName: l.tenantName,
      tenantEmail: l.tenantEmail,
      tenantPhone: l.tenantPhone,
      rent: Number(l.rent) || 0,
      securityDeposit: Number(l.securityDeposit) || 0,
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      recentPayments: l.payments.map((p) => ({
        amount: Number(p.amount),
        period: p.period,
        receivedAt: p.receivedAt,
      })),
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

  // Validate required fields
  const propertyId = (body.propertyId as string)?.trim();
  const tenantName = (body.tenantName as string)?.trim();

  if (!propertyId) {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }
  if (!tenantName) {
    return NextResponse.json({ error: "tenantName is required" }, { status: 400 });
  }

  // Verify property belongs to company
  const property = await prisma.property.findFirst({
    where: { id: propertyId, companyId: user.companyId },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const lease = await prisma.lease.create({
    data: {
      companyId: user.companyId,
      propertyId,
      tenantName,
      tenantEmail: (body.tenantEmail as string)?.trim() || null,
      tenantPhone: (body.tenantPhone as string)?.trim() || null,
      rent: body.rent != null ? Number(body.rent) : null,
      securityDeposit: body.securityDeposit != null ? Number(body.securityDeposit) : null,
      startDate: body.startDate ? new Date(body.startDate as string) : null,
      endDate: body.endDate ? new Date(body.endDate as string) : null,
      status: (body.status as string) || "Active",
    },
  });

  return NextResponse.json(
    {
      id: lease.id,
      propertyId: lease.propertyId,
      tenantName: lease.tenantName,
      tenantEmail: lease.tenantEmail,
      tenantPhone: lease.tenantPhone,
      rent: Number(lease.rent) || 0,
      securityDeposit: Number(lease.securityDeposit) || 0,
      startDate: lease.startDate,
      endDate: lease.endDate,
      status: lease.status,
    },
    { status: 201 }
  );
}