import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      leases: {
        include: {
          payments: {
            orderBy: { receivedAt: "desc" },
          },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: property.id,
    code: property.code,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    status: property.status,
    acquired: property.acquired,
    baseline: property.baseline ? Number(property.baseline) : null,
    currentRoi: property.currentRoi ? Number(property.currentRoi) : null,
    leases: property.leases.map((l) => ({
      id: l.id,
      tenantName: l.tenantName,
      tenantEmail: l.tenantEmail,
      tenantPhone: l.tenantPhone,
      rent: Number(l.rent) || 0,
      securityDeposit: Number(l.securityDeposit) || 0,
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      payments: l.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        period: p.period,
        receivedAt: p.receivedAt,
        method: p.method,
        notes: p.notes,
      })),
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (typeof body.status === "string") updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.property.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
  });
}