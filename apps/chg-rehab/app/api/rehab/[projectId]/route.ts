import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Resolve a project the current user is allowed to see. The route param holds
 * either the project `code` (how the Rehab UI links) or the raw `id`; either
 * resolves, always scoped to the user's company.
 */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true, meta: true },
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Patch project-level fields editable inline from the Overview tab. Currently
 * only the actual completion date, persisted into `project.meta.actualEndDate`
 * (the Project model has no dedicated column for it).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("actualEndDate" in body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let actualEndDate: string | null;
  if (body.actualEndDate === null || body.actualEndDate === "") {
    actualEndDate = null;
  } else if (typeof body.actualEndDate === "string" && ISO_DATE.test(body.actualEndDate)) {
    // Strict calendar validation — reject non-existent dates (e.g. 2026-02-31,
    // which `new Date()` would silently roll forward into March).
    const [y, m, dd] = body.actualEndDate.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, dd));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== dd) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    actualEndDate = body.actualEndDate;
  } else {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const currentMeta =
    project.meta && typeof project.meta === "object" && !Array.isArray(project.meta)
      ? (project.meta as Record<string, unknown>)
      : {};
  const meta = { ...currentMeta, actualEndDate };

  await prisma.project.update({ where: { id: project.id }, data: { meta } });
  return NextResponse.json({ ok: true, actualEndDate });
}

/**
 * Delete a project (and, via cascading FKs, all of its phases, draws, SOW
 * sections, addenda, assignments, invoices, and change orders). Optional
 * relations (documents, warehouse allocations) are detached, not deleted.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id: project.id } });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "project.deleted",
      entity: "Project",
      entityId: project.id,
      message: `Rehab project ${project.code} deleted`,
    },
  });

  return NextResponse.json({ ok: true });
}
