import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { estimateTotals } from "@/lib/rehab/estimates";

export const dynamic = "force-dynamic";

/**
 * Snapshot an estimate into the Documents hub: creates a Document with
 * category "Estimation" (company level, linked to the estimate's property when
 * set) whose meta carries the estimate id and its totals at save time.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { estimateId } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId: user.companyId },
    include: { lines: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totals = estimateTotals(
    estimate.lines.map((l) => ({
      laborCost: Number(l.laborCost),
      materialCost: Number(l.materialCost),
      unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
      quantity: l.quantity == null ? null : Number(l.quantity),
    })),
    estimate.sqft
  );

  const doc = await prisma.document.create({
    data: {
      companyId: user.companyId,
      level: estimate.propertyId ? "Property" : "Company",
      category: "Estimation",
      name: estimate.title,
      propertyId: estimate.propertyId,
      uploadedById: user.id,
      meta: {
        estimateId: estimate.id,
        rehabType: estimate.rehabType,
        sqft: estimate.sqft,
        laborTotal: totals.labor,
        materialTotal: totals.material,
        grandTotal: totals.grand,
        perSqft: totals.perSqft,
        lineCount: estimate.lines.length,
      },
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "document.uploaded",
      entity: "Document",
      entityId: doc.id,
      message: `Estimate "${estimate.title}" saved to Documents · Estimation · $${Math.round(totals.grand).toLocaleString()}.`,
      meta: { type: "document", estimateId: estimate.id },
    },
  });

  return NextResponse.json({ document: { id: doc.id } }, { status: 201 });
}
