import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function personName(u: { firstName: string | null; lastName: string | null; email: string | null } | null) {
  if (!u) return "User";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "User";
}
function personInitials(u: { firstName: string | null; lastName: string | null; initials: string | null } | null) {
  if (!u) return "?";
  return (u.initials || [(u.firstName ?? "")[0], (u.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase();
}

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;

  const t = await prisma.pmTask.findFirst({
    where: { id: taskId, companyId: user.companyId },
    include: {
      list: { select: { spaceId: true } },
      status: { select: { id: true, name: true, color: true, type: true } },
      assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } } },
      tags: { include: { tag: true } },
      subtasks: {
        orderBy: { createdAt: "asc" },
        include: {
          status: { select: { id: true, name: true, color: true, type: true } },
          assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } } },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } },
      },
      activity: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } },
      },
    },
  });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Selectable statuses for this task's space (used by the detail panel).
  const statuses = await prisma.pmStatus.findMany({
    where: { companyId: user.companyId, spaceId: t.list.spaceId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, type: true, order: true, isDefault: true },
  });

  return NextResponse.json({
    task: {
      id: t.id,
      name: t.name,
      description: t.description,
      taskType: t.taskType,
      priority: t.priority,
      statusId: t.statusId,
      status: t.status,
      listId: t.listId,
      timeEstimate: t.timeEstimate,
      sprintPoints: t.sprintPoints,
      startDate: t.startDate?.toISOString() ?? null,
      dueDate: t.dueDate?.toISOString() ?? null,
      doneDate: t.doneDate?.toISOString() ?? null,
      assignees: t.assignees.map((a) => ({ id: a.user.id, name: personName(a.user), initials: personInitials(a.user) })),
      tags: t.tags.map((x) => x.tag),
      subtasks: t.subtasks.map((st) => ({
        id: st.id,
        name: st.name,
        statusId: st.statusId,
        status: st.status,
        doneDate: st.doneDate?.toISOString() ?? null,
        assignees: st.assignees.map((a) => ({ id: a.user.id, name: personName(a.user), initials: personInitials(a.user) })),
      })),
      comments: t.comments.map((c) => ({
        id: c.id,
        body: c.body,
        isEdited: c.isEdited,
        createdAt: c.createdAt.toISOString(),
        author: { id: c.author.id, name: personName(c.author), initials: personInitials(c.author) },
      })),
      activity: t.activity.map((a) => ({
        id: a.id,
        type: a.type,
        payload: a.payload,
        createdAt: a.createdAt.toISOString(),
        user: { id: a.user.id, name: personName(a.user), initials: personInitials(a.user) },
      })),
      statuses,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;

  const existing = await prisma.pmTask.findFirst({
    where: { id: taskId, companyId: user.companyId },
    select: { id: true, statusId: true, list: { select: { spaceId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    statusId?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    taskType?: string;
    timeEstimate?: number | null;
    sprintPoints?: number | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.taskType !== undefined) data.taskType = body.taskType;
  if (body.timeEstimate !== undefined) data.timeEstimate = body.timeEstimate;
  if (body.sprintPoints !== undefined) data.sprintPoints = body.sprintPoints;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;

  let statusChanged = false;
  if (body.statusId !== undefined) {
    if (body.statusId) {
      const st = await prisma.pmStatus.findFirst({
        where: { id: body.statusId, companyId: user.companyId, spaceId: existing.list.spaceId },
        select: { id: true, type: true },
      });
      if (st) {
        data.statusId = st.id;
        statusChanged = st.id !== existing.statusId;
        data.doneDate = st.type === "done" || st.type === "closed" ? new Date() : null;
      }
    } else {
      data.statusId = null;
      statusChanged = existing.statusId !== null;
      data.doneDate = null;
    }
  }

  const task = await prisma.pmTask.update({ where: { id: taskId }, data });

  if (statusChanged) {
    await prisma.pmActivity.create({
      data: {
        taskId,
        userId: user.id,
        type: "status_changed",
        payload: { from: existing.statusId, to: task.statusId },
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;

  const existing = await prisma.pmTask.findFirst({
    where: { id: taskId, companyId: user.companyId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pmTask.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
