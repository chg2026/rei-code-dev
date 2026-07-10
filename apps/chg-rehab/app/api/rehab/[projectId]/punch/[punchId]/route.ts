import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { PunchStatus, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

function isPunchStatus(v: unknown): v is PunchStatus {
  return v === PunchStatus.Open || v === PunchStatus.Done;
}

async function loadScoped(projectIdOrCode: string, punchId: string, companyId: string) {
  const project = await resolveProject(projectIdOrCode, companyId);
  if (!project) return { project: null, item: null };
  const item = await prisma.punchItem.findFirst({ where: { id: punchId, projectId: project.id } });
  return { project, item };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; punchId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, punchId } = await params;
  const { project, item } = await loadScoped(
    decodeURIComponent(projectId),
    punchId,
    user.companyId
  );
  if (!project || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.PunchItemUncheckedUpdateInput = {};

  if ("title" in body) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    data.title = t;
  }
  if ("location" in body) {
    data.location =
      typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
  }
  if ("phaseId" in body) {
    if (body.phaseId === null || body.phaseId === "") {
      data.phaseId = null;
    } else if (typeof body.phaseId === "string") {
      const phase = await prisma.phase.findFirst({
        where: { id: body.phaseId, projectId: project.id },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });
      data.phaseId = phase.id;
    } else {
      return NextResponse.json({ error: "Invalid phaseId" }, { status: 400 });
    }
  }
  if ("assigneeId" in body) {
    if (body.assigneeId === null || body.assigneeId === "") {
      data.assigneeId = null;
    } else if (typeof body.assigneeId === "string") {
      const assignee = await prisma.user.findFirst({
        where: { id: body.assigneeId, companyId: user.companyId },
        select: { id: true },
      });
      if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
      data.assigneeId = assignee.id;
    } else {
      return NextResponse.json({ error: "Invalid assigneeId" }, { status: 400 });
    }
  }

  let doneNow = false;
  if ("status" in body) {
    if (!isPunchStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === PunchStatus.Done && item.status !== PunchStatus.Done) {
      data.doneAt = new Date();
      doneNow = true;
    } else if (body.status === PunchStatus.Open && item.status === PunchStatus.Done) {
      data.doneAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.punchItem.update({
    where: { id: item.id },
    data,
    include: { phase: { select: { id: true, number: true, name: true } } },
  });

  if (doneNow) {
    await prisma.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "punch.resolved",
        entity: "PunchItem",
        entityId: item.id,
        message: `Punch item completed: "${updated.title}".`,
        meta: { type: "task", projectId: project.id, phaseId: updated.phaseId },
      },
    });
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; punchId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, punchId } = await params;
  const { project, item } = await loadScoped(
    decodeURIComponent(projectId),
    punchId,
    user.companyId
  );
  if (!project || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.photo.updateMany({ where: { punchItemId: item.id }, data: { punchItemId: null } }),
    prisma.punchItem.delete({ where: { id: item.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
