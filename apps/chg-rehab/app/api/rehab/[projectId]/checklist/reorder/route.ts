import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseChecklistItemMeta } from "@/lib/rehab/types";

export const dynamic = "force-dynamic";

async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

/**
 * Persist a new manual order for a phase's checklist items. Order lives in
 * `meta.order` (no `order` column exists). Every id in `orderedIds` must belong
 * to the phase; the whole set is rewritten in a transaction.
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
  const phaseId = body && typeof body.phaseId === "string" ? body.phaseId : "";
  const orderedIds: unknown = body?.orderedIds;
  if (!phaseId || !Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "phaseId and orderedIds[] are required" }, { status: 400 });
  }

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: { id: true },
  });
  if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });

  const items = await prisma.checklistItem.findMany({
    where: { phaseId: phase.id },
    select: { id: true, meta: true },
  });
  const itemIds = new Set(items.map((i) => i.id));
  const ids = orderedIds as string[];
  if (ids.length !== items.length || !ids.every((id) => itemIds.has(id))) {
    return NextResponse.json({ error: "orderedIds must list every item in the checklist exactly once" }, { status: 400 });
  }

  const metaById = new Map(items.map((i) => [i.id, parseChecklistItemMeta(i.meta)]));
  await prisma.$transaction(
    ids.map((id, index) => {
      const m = metaById.get(id)!;
      return prisma.checklistItem.update({
        where: { id },
        data: { meta: { requirement: m.requirement, order: index } },
      });
    })
  );

  return NextResponse.json({ ok: true });
}
