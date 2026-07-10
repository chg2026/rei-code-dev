import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseChecklistItemMeta } from "@/lib/rehab/types";
import { projectChecklistItem } from "../route";

export const dynamic = "force-dynamic";

/** Load the item only if it belongs to a phase in a project in the user's company. */
async function loadItem(itemId: string, projectIdOrCode: string, companyId: string) {
  return prisma.checklistItem.findFirst({
    where: {
      id: itemId,
      phase: {
        project: {
          companyId,
          OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }],
        },
      },
    },
    select: { id: true, label: true, status: true, meta: true, phaseId: true, phase: { select: { projectId: true } } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, itemId } = await params;
  const item = await loadItem(itemId, decodeURIComponent(projectId), user.companyId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const meta = parseChecklistItemMeta(item.meta);
  let label = item.label;
  if ("label" in body) {
    const next = typeof body.label === "string" ? body.label.trim() : "";
    if (!next) return NextResponse.json({ error: "Item text is required" }, { status: 400 });
    label = next;
  }
  if ("requirement" in body) {
    meta.requirement =
      typeof body.requirement === "string" && body.requirement.trim() ? body.requirement.trim() : null;
  }

  const updated = await prisma.checklistItem.update({
    where: { id: item.id },
    data: { label, meta: { requirement: meta.requirement, order: meta.order } },
  });

  return NextResponse.json({ item: projectChecklistItem(updated) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, itemId } = await params;
  const item = await loadItem(itemId, decodeURIComponent(projectId), user.companyId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.checklistItem.delete({ where: { id: item.id } });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "checklist.item.deleted",
      entity: "ChecklistItem",
      entityId: item.id,
      message: `Checklist item removed: "${item.label}".`,
      meta: { type: "task", phaseId: item.phaseId, projectId: item.phase.projectId },
    },
  });

  return NextResponse.json({ ok: true });
}
