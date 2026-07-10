import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseChecklistItemMeta } from "@/lib/rehab/types";
import type { ChecklistStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

export function projectChecklistItem(item: {
  id: string;
  label: string;
  status: ChecklistStatus;
  meta: Prisma.JsonValue | null;
}) {
  const m = parseChecklistItemMeta(item.meta);
  return { id: item.id, label: item.label, status: item.status, requirement: m.requirement, order: m.order };
}

/**
 * Create a single checklist item on a phase (job type). Structural checklist
 * edits are privileged ("rehab"/"edit") — not the lighter "checklist"/"edit"
 * used for toggling — because adding/removing items changes the payment gate.
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const phaseId = typeof body.phaseId === "string" ? body.phaseId : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!phaseId) return NextResponse.json({ error: "phaseId is required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Item text is required" }, { status: 400 });
  const requirement =
    typeof body.requirement === "string" && body.requirement.trim() ? body.requirement.trim() : null;

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: { id: true },
  });
  if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });

  const existing = await prisma.checklistItem.findMany({
    where: { phaseId: phase.id },
    select: { meta: true },
  });
  const maxOrder = existing.reduce((max, i) => {
    const o = parseChecklistItemMeta(i.meta).order;
    return o != null && o > max ? o : max;
  }, -1);

  const item = await prisma.checklistItem.create({
    data: {
      phaseId: phase.id,
      label,
      meta: { requirement, order: maxOrder + 1 },
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "checklist.item.created",
      entity: "ChecklistItem",
      entityId: item.id,
      message: `Checklist item added: "${label}".`,
      meta: { type: "task", phaseId: phase.id, projectId: project.id },
    },
  });

  return NextResponse.json({ item: projectChecklistItem(item) }, { status: 201 });
}
