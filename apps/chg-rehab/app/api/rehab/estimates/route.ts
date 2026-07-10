import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const estimates = await prisma.estimate.findMany({
    where: { companyId: user.companyId },
    include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ estimates });
}

/**
 * Create an estimate. With `copyFromProjectId`, seeds one line per job type of
 * that project using its actual labor/material spend (shared invoice-actuals
 * helper) as the starting numbers.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
  const rehabType =
    typeof body.rehabType === "string" && body.rehabType.trim() ? body.rehabType.trim() : null;
  let sqft: number | null = null;
  if (body.sqft !== null && body.sqft !== undefined && body.sqft !== "") {
    const n = Number(body.sqft);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Invalid sqft" }, { status: 400 });
    }
    sqft = n;
  }

  type SeedLine = {
    costCode: number | null;
    name: string;
    laborCost: number;
    materialCost: number;
  };
  let seedLines: SeedLine[] = [];
  let propertyId: string | null = null;

  const copyFromProjectId =
    typeof body.copyFromProjectId === "string" && body.copyFromProjectId
      ? body.copyFromProjectId
      : null;
  if (copyFromProjectId) {
    const project = await prisma.project.findFirst({
      where: {
        companyId: user.companyId,
        OR: [{ id: copyFromProjectId }, { code: copyFromProjectId }],
      },
      include: { phases: { orderBy: { number: "asc" } } },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const actuals = await computePhaseActualBreakdowns(project.id);
    seedLines = project.phases.map((p) => {
      const b = actuals.get(p.id);
      return {
        costCode: p.number,
        name: p.name,
        laborCost: Number(b?.labor ?? 0),
        materialCost: Number(b?.materials ?? 0),
      };
    });
    propertyId = project.propertyId;
    if (!title) title = `Estimate — ${project.code}`;
  }
  if (!title) title = "New estimate";

  const estimate = await prisma.estimate.create({
    data: {
      companyId: user.companyId,
      propertyId,
      title,
      rehabType,
      sqft,
      createdById: user.id,
      lines: { create: seedLines },
    },
    include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });

  return NextResponse.json({ estimate }, { status: 201 });
}
