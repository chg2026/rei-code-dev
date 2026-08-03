import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseKickoff, normalizeKickoffItems, kickoffProgress } from "@/lib/rehab/kickoff";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true, meta: true },
  });
}

/**
 * GET the kickoff checklist. Seeds the default items in the response when none
 * are persisted yet, WITHOUT writing (a read must never mutate). The first
 * PATCH persists whatever the PM has.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { items } = parseKickoff(project.meta);
  return NextResponse.json({ items, progress: kickoffProgress(items) });
}

/**
 * PATCH replaces the kickoff items array. The client sends the full desired
 * list (after a toggle / add / remove) — simplest correct model for a small
 * editable checklist. Merges into project.meta so no other meta key is lost.
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
  const items = normalizeKickoffItems((body as { items?: unknown }).items, user.id);
  if (items === null) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  // Merge into existing meta — never clobber other keys (mode, penalty*, etc.).
  const currentMeta =
    project.meta && typeof project.meta === "object" && !Array.isArray(project.meta)
      ? (project.meta as Record<string, unknown>)
      : {};
  const meta = { ...currentMeta, kickoff: items } as Prisma.InputJsonValue;

  await prisma.project.update({ where: { id: project.id }, data: { meta } });

  const progress = kickoffProgress(items);
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "project.kickoff.updated",
      entity: "Project",
      entityId: project.id,
      message: `Kickoff checklist updated (${progress.done}/${progress.total} complete)`,
      meta: { type: "task", projectId: project.id },
    },
  });

  return NextResponse.json({ items, progress });
}
