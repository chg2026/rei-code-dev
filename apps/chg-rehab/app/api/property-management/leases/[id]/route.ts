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
  const lease = await prisma.lease.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      payments: {
        orderBy: { receivedAt: "desc" },
      },
    },
  });

  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: lease.id,
    propertyId: lease.propertyId,
    propertyCode: lease.property?.code ?? null,
    propertyAddress: lease.property?.address ?? null,
    tenantName: lease.tenantName,
    tenantEmail: lease.tenantEmail,
    tenantPhone: lease.tenantPhone,
    rent: Number(lease.rent) || 0,
    securityDeposit: Number(lease.securityDeposit) || 0,
    startDate: lease.startDate,
    endDate: lease.endDate,
    status: lease.status,
    payments: lease.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      period: p.period,
      receivedAt: p.receivedAt,
      method: p.method,
      notes: p.notes,
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
  const lease = await prisma.lease.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body.tenantName === "string") updates.tenantName = body.tenantName.trim();
  if (body.tenantEmail !== undefined) updates.tenantEmail = (body.tenantEmail as string)?.trim() || null;
  if (body.tenantPhone !== undefined) updates.tenantPhone = (body.tenantPhone as string)?.trim() || null;
  if (body.rent != null) updates.rent = Number(body.rent);
  if (body.securityDeposit != null) {
    updates.securityDeposit = Number(body.securityDeposit);
  }
  if (body.startDate !== undefined) {
    updates.startDate = body.startDate ? new Date(body.startDate as string) : null;
  }
  if (body.endDate !== undefined) {
    updates.endDate = body.endDate ? new Date(body.endDate as string) : null;
  }
  if (typeof body.status === "string") updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.lease.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({
    id: updated.id,
    tenantName: updated.tenantName,
    tenantEmail: updated.tenantEmail,
    tenantPhone: updated.tenantPhone,
    rent: Number(updated.rent) || 0,
    securityDeposit: Number(updated.securityDeposit) || 0,
    startDate: updated.startDate,
    endDate: updated.endDate,
    status: updated.status,
  });
}