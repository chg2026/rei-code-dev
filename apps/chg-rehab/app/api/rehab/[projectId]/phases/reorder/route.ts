import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export const dynamic = "force-dynamic";

async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

/**
 * POST /api/rehab/[projectId]/phases/reorder
 *
 * Body: { phaseIds: string[] } — the phase ids in their new display order.
 * Rewrites each phase's `sortOrder` to its 1-based index in one transaction.
 * `number` (the cost code) is NEVER touched, so invoices, draws, and budget
 * codes keep mapping to the same phase. The submitted set must be exactly the
 * project's phases (no adds/drops) or the request is rejected.
 */
export async function POST(
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
  if (!body || typeof body !== "object" || !Array.isArray(body.phaseIds)) {
    return NextResponse.json({ error: "phaseIds array required" }, { status: 400 });
  }
  const phaseIds: string[] = body.phaseIds.filter((x: unknown): x is string => typeof x === "string");

  const existing = await prisma.phase.findMany({
    where: { projectId: project.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((p) => p.id));

  // The submitted list must be a permutation of exactly this project's phases —
  // no duplicates, nothing missing, nothing foreign.
  const submitted = new Set(phaseIds);
  if (
    phaseIds.length !== existing.length ||
    submitted.size !== phaseIds.length ||
    phaseIds.some((id) => !existingIds.has(id))
  ) {
    return NextResponse.json(
      { error: "phaseIds must list every phase of this project exactly once." },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    phaseIds.map((id, idx) =>
      prisma.phase.update({ where: { id }, data: { sortOrder: idx + 1 } })
    )
  );

  return NextResponse.json({ ok: true });
}
