import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";
import { WsTaskStatus } from "@prisma/client";

const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
const STATUSES = Object.values(WsTaskStatus) as string[];

function personName(u: { firstName: string | null; lastName: string | null; email: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "User";
}
function personInitials(u: { firstName: string | null; lastName: string | null; initials: string | null }) {
  return (
    u.initials ||
    [(u.firstName ?? "")[0], (u.lastName ?? "")[0]].filter(Boolean).join("") ||
    "?"
  ).toUpperCase();
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    done?: boolean;
    title?: string;
    priority?: string;
    status?: string;
    isPrivate?: boolean;
    dueDate?: string | null;
    description?: string | null;
    assigneeId?: string | null;
    assigneeIds?: string[];
    spaceId?: string | null;
  };

  const existing = await prisma.wsTask.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  // Department (PmSpace)
  if (typeof body.spaceId !== "undefined") {
    if (body.spaceId === null) {
      data.spaceId = null;
    } else {
      const space = await prisma.pmSpace.findFirst({
        where: { id: body.spaceId, companyId: user.companyId },
        select: { id: true },
      });
      if (space) data.spaceId = space.id;
    }
  }

  // Status <-> done are kept in sync.
  if (typeof body.status === "string" && STATUSES.includes(body.status)) {
    data.status = body.status as WsTaskStatus;
    const isDone = body.status === WsTaskStatus.Done;
    data.done = isDone;
    data.doneAt = isDone ? new Date() : null;
  } else if (typeof body.done === "boolean") {
    data.done = body.done;
    data.doneAt = body.done ? new Date() : null;
    if (body.done) data.status = WsTaskStatus.Done;
    else if (existing.status === WsTaskStatus.Done) data.status = WsTaskStatus.NotStarted;
  }

  if (typeof body.isPrivate === "boolean") {
    data.isPrivate = body.isPrivate;
  }

  // Invariant: private tasks never carry a department. Enforce regardless of
  // which fields the caller sent (e.g. spaceId set while the task stays private).
  const willBePrivate = typeof data.isPrivate === "boolean" ? (data.isPrivate as boolean) : existing.isPrivate;
  if (willBePrivate) data.spaceId = null;

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.priority && PRIORITIES.includes(body.priority)) data.priority = body.priority;
  if (typeof body.dueDate !== "undefined") data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (typeof body.description === "string") data.description = body.description;

  // Multi-assignee diff (preferred). Falls back to legacy single assigneeId.
  let newlyAssigned: string[] = [];
  if (Array.isArray(body.assigneeIds)) {
    const requested = Array.from(new Set(body.assigneeIds.filter(Boolean)));
    const valid = requested.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: requested }, companyId: user.companyId, active: true },
            select: { id: true },
          })
        ).map((m) => m.id)
      : [];
    const existingRows = await prisma.wsTaskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
    const existingIds = existingRows.map((r) => r.userId);
    const toAdd = valid.filter((u) => !existingIds.includes(u));
    const toRemove = existingIds.filter((u) => !valid.includes(u));
    if (toRemove.length) {
      await prisma.wsTaskAssignee.deleteMany({ where: { taskId: id, userId: { in: toRemove } } });
    }
    if (toAdd.length) {
      await prisma.wsTaskAssignee.createMany({
        data: toAdd.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      });
    }
    data.assigneeId = valid[0] ?? null;
    newlyAssigned = toAdd;
  } else if (typeof body.assigneeId !== "undefined") {
    if (body.assigneeId === null) {
      data.assigneeId = null;
      await prisma.wsTaskAssignee.deleteMany({ where: { taskId: id } });
    } else {
      const member = await prisma.user.findFirst({
        where: { id: body.assigneeId, companyId: user.companyId, active: true },
      });
      if (member) {
        data.assigneeId = member.id;
        await prisma.wsTaskAssignee.deleteMany({ where: { taskId: id, userId: { not: member.id } } });
        await prisma.wsTaskAssignee.createMany({
          data: [{ taskId: id, userId: member.id }],
          skipDuplicates: true,
        });
        if (member.id !== existing.assigneeId) newlyAssigned = [member.id];
      }
    }
  }

  const updated = await prisma.wsTask.update({ where: { id }, data });

  // Activity feed.
  const activityRows: { taskId: string; userId: string; action: string; detail: string | null }[] = [];
  const becameDone = data.done === true && !existing.done;
  if (becameDone) activityRows.push({ taskId: id, userId: user.id, action: "completed", detail: null });
  if (typeof body.status === "string" && data.status && data.status !== existing.status) {
    activityRows.push({ taskId: id, userId: user.id, action: "status_changed", detail: body.status });
  }
  if (typeof body.dueDate !== "undefined" && data.dueDate instanceof Date) {
    activityRows.push({
      taskId: id,
      userId: user.id,
      action: "due_date_set",
      detail: (data.dueDate as Date).toISOString().slice(0, 10),
    });
  }
  if (activityRows.length > 0) {
    await prisma.wsTaskActivity.createMany({ data: activityRows }).catch(() => undefined);
  }

  // Notify newly-added assignees.
  const assignerName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
  for (const assigneeId of newlyAssigned) {
    if (assigneeId === user.id) continue;
    await enqueueWorkspaceInApp({
      companyId: user.companyId,
      userId: assigneeId,
      event: "workspace.task.assigned",
      title: `New task: ${existing.title}`,
      body: `${assignerName} assigned you a task.`,
      link: "/command-center",
      urgent: (data.priority ?? existing.priority) === "Urgent",
      dedupeKey: `task:${id}:assigned:${assigneeId}`,
    });
  }

  // Notify creator when an assigned-out task gets completed.
  if (
    becameDone &&
    existing.assigneeId &&
    existing.assigneeId !== existing.createdById &&
    user.id === existing.assigneeId
  ) {
    const closerName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
    await enqueueWorkspaceInApp({
      companyId: user.companyId,
      userId: existing.createdById,
      event: "workspace.task.completed",
      title: `Task completed: ${existing.title}`,
      body: `${closerName} marked your assigned task as done.`,
      link: "/command-center",
      dedupeKey: `task:${existing.id}:completed`,
    });
  }

  return NextResponse.json({ id: updated.id, done: updated.done, status: updated.status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.wsTask.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Deleting a parent removes its subtasks too (don't orphan them as top-level tasks).
  await prisma.wsTask.deleteMany({ where: { parentTaskId: id, companyId: user.companyId } });
  await prisma.wsTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
      assignees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
        },
        orderBy: { assignedAt: "asc" },
      },
      space: { select: { id: true, name: true, color: true } },
      subtasks: {
        select: { id: true, title: true, done: true, status: true, priority: true },
        orderBy: { createdAt: "asc" },
      },
      activity: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } },
      },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      isPrivate: task.isPrivate,
      dueDate: task.dueDate?.toISOString() ?? null,
      done: task.done,
      description: task.description ?? null,
      linkLabel: task.linkLabel ?? null,
      linkType: task.linkType ?? null,
      linkId: task.linkId ?? null,
      createdAt: task.createdAt.toISOString(),
      space: task.space ? { id: task.space.id, name: task.space.name, color: task.space.color } : null,
      assignees: task.assignees.map((a) => ({
        user: {
          id: a.user.id,
          name: personName(a.user),
          initials: personInitials(a.user),
          avatarUrl: null as string | null,
        },
      })),
      assignee: task.assignee
        ? { id: task.assignee.id, name: personName(task.assignee), initials: personInitials(task.assignee) }
        : null,
      subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, status: s.status, priority: s.priority })),
      activity: task.activity.map((a) => ({
        id: a.id,
        action: a.action,
        detail: a.detail ?? null,
        createdAt: a.createdAt.toISOString(),
        user: {
          id: a.user.id,
          name: personName(a.user),
          initials: personInitials(a.user),
        },
      })),
    },
  });
}
