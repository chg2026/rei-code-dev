import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

type Bounds = { min: number; max: number; integer?: boolean };
const FIELD_BOUNDS: Record<string, Bounds> = {
  arv: { min: 0, max: 1_000_000_000 },
  acquisitionCost: { min: 0, max: 1_000_000_000 },
  refiLtvPct: { min: 0, max: 100 },
  refiRatePct: { min: 0, max: 100 },
  refiTermYears: { min: 1, max: 50, integer: true },
  monthlyRent: { min: 0, max: 10_000_000 },
  monthlyExpenses: { min: 0, max: 10_000_000 },
};

/**
 * Save the Rehab-to-Return inputs onto the Project. Every field is nullable —
 * sending null/"" clears it. Derived metrics (all-in, MAO, DSCR, …) are never
 * stored; they're recomputed from these inputs + the shared Projected Final.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.ProjectUpdateInput = {};
  for (const [field, bounds] of Object.entries(FIELD_BOUNDS)) {
    if (!(field in body)) continue;
    const raw = (body as Record<string, unknown>)[field];
    if (raw === null || raw === "") {
      (data as Record<string, unknown>)[field] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < bounds.min || n > bounds.max || (bounds.integer && !Number.isInteger(n))) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    (data as Record<string, unknown>)[field] = n;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data,
    select: {
      arv: true,
      acquisitionCost: true,
      refiLtvPct: true,
      refiRatePct: true,
      refiTermYears: true,
      monthlyRent: true,
      monthlyExpenses: true,
    },
  });
  return NextResponse.json({ returns: updated });
}
