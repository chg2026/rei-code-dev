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
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const where: Record<string, unknown> = {
    companyId: user.companyId,
    status: { in: ["rental", "Rental"], not: null },
  };

  if (status && status !== "all") {
    where.status = status;
  }
  if (q) {
    where.OR = [
      { address: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }

  const properties = await prisma.property.findMany({
    where: where as any,
    include: {
      leases: {
        where: { status: "Active" },
        select: {
          id: true,
          tenantName: true,
          rent: true,
          startDate: true,
          endDate: true,
          securityDeposit: true,
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    properties: properties.map((p) => ({
      id: p.id,
      code: p.code,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      status: p.status,
      activeLease: p.leases[0]
        ? {
            id: p.leases[0].id,
            tenantName: p.leases[0].tenantName,
            rent: Number(p.leases[0].rent) || 0,
            startDate: p.leases[0].startDate,
            endDate: p.leases[0].endDate,
            securityDeposit: Number(p.leases[0].securityDeposit) || 0,
          }
        : null,
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
  const propertyId = body.propertyId as string | undefined;
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }

  // Verify property belongs to company
  const property = await prisma.property.findFirst({
    where: { id: propertyId, companyId: user.companyId },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  // Set status to rental
  await prisma.property.update({
    where: { id: propertyId },
    data: { status: "rental" },
  });

  return NextResponse.json({ success: true, propertyId });
}