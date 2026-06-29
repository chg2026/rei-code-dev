import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";
import { Prisma, WsTaskStatus } from "@prisma/client";

type Filter = "all" | "mine" | "assigned-out";
type View = "all" | "private" | "assignedOut";

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

const assigneeInclude = {
  assignees: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
    },
    orderBy: { assignedAt: "asc" },
  },
} satisfies Prisma.WsTaskInclude;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") as View | null;
  const userId = url.searchParams.get("userId");
  const filter = (url.searchParams.get("filter") || "all") as Filter;
  const includeDone = url.searchParams.get("done") === "1";

  // Top-level lists never include subtasks — they live only inside their parent.
  const where: Record<string, unknown> = { companyId: user.companyId, parentTaskId: null };

  if (view) {
    // New view model used by the rebuilt /workspace/tasks page.
    if (view === "private") {
      where.isPrivate = true;
      where.createdById = user.id;
    } else if (view === "assignedOut") {
      where.isPrivate = false;
      where.createdById = user.id;
      where.assignees = { some: { userId: { not: user.id } } };
    } else {
      // all: non-private tasks for the company where the user is assignee or creator
      where.isPrivate = false;
      where.OR = [
        { createdById: user.id },
        { assigneeId: user.id },
        { assignees: { some: { userId: user.id } } },
      ];
    }
    // Optional person filter — only tasks where the given user is an assignee.
    // Use AND so it never clobbers the view's own assignee/OR conditions.
    if (userId) where.AND = [{ assignees: { some: { userId } } }];
  } else {
    // Legacy query model (property tabs, calendar, etc.) — keep working.
    if (!includeDone) where.done = false;
    const spaceFilter = url.searchParams.get("spaceId");
    if (spaceFilter) where.spaceId = spaceFilter;
    if (filter === "mine") where.assigneeId = user.id;
    if (filter === "assigned-out") {
      where.createdById = user.id;
      where.assigneeId = { not: user.id };
    }
    const linkType = url.searchParams.get("linkType");
    const linkId = url.searchParams.get("linkId");
    if (linkType === "property" && linkId) {
      const projects = await prisma.project.findMany({
        where: { companyId: user.companyId, propertyId: linkId },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);
      where.OR = [
        { linkType: "property", linkId },
        ...(projectIds.length ? [{ linkType: "project", linkId: { in: projectIds } }] : []),
      ];
    } else {
      if (linkType) where.linkType = linkType;
      if (linkId) where.linkId = linkId;
    }
  }

  const tasks = await prisma.wsTask.findMany({
    where,
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      space: { select: { id: true, name: true, color: true } },
      ...assigneeInclude,
    },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      isPrivate: t.isPrivate,
      dueDate: t.dueDate?.toISOString() ?? null,
      done: t.done,
      doneAt: t.doneAt?.toISOString() ?? null,
      linkType: t.linkType,
      linkId: t.linkId,
      linkLabel: t.linkLabel,
      space: t.space ? { id: t.space.id, name: t.space.name, color: t.space.color } : null,
      assignees: t.assignees.map((a) => ({
        user: {
          id: a.user.id,
          name: personName(a.user),
          initials: personInitials(a.user),
          avatarUrl: null as string | null,
        },
      })),
      // Legacy single assignee kept for back-compat with older callers.
      assignee: t.assignee
        ? { id: t.assignee.id, name: personName(t.assignee), initials: personInitials(t.assignee) }
        : null,
      createdBy: t.createdBy
        ? { id: t.createdBy.id, name: [t.createdBy.firstName, t.createdBy.lastName].filter(Boolean).join(" ") || "User" }
        : null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    assigneeId?: string | null;
    assigneeIds?: string[];
    status?: string;
    isPrivate?: boolean;
    dueDate?: string | null;
    priority?: string;
    description?: string | null;
    linkType?: string | null;
    linkId?: string | null;
    linkLabel?: string | null;
    sourceMessageId?: string | null;
    parentTaskId?: string | null;
    spaceId?: string | null;
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const isPrivate = body.isPrivate === true;

  // Validate the department (PmSpace). Private tasks never carry a department.
  let spaceId: string | null = null;
  if (!isPrivate && body.spaceId) {
    const space = await prisma.pmSpace.findFirst({
      where: { id: body.spaceId, companyId: user.companyId },
      select: { id: true },
    });
    if (space) spaceId = space.id;
  }

  // Validate parent task (for subtasks) belongs to the same company.
  let parentTaskId: string | null = null;
  if (body.parentTaskId) {
    const parent = await prisma.wsTask.findFirst({
      where: { id: body.parentTaskId, companyId: user.companyId },
      select: { id: true },
    });
    if (parent) parentTaskId = parent.id;
  }

  // Resolve assignees (new multi-select + legacy single field), validated against company.
  const requested = Array.from(
    new Set([...(body.assigneeIds ?? []), ...(body.assigneeId ? [body.assigneeId] : [])].filter(Boolean)),
  ) as string[];
  let assigneeIds: string[] = [];
  if (requested.length) {
    const members = await prisma.user.findMany({
      where: { id: { in: requested }, companyId: user.companyId, active: true },
      select: { id: true },
    });
    assigneeIds = members.map((m) => m.id);
  }
  const primaryAssigneeId = assigneeIds[0] ?? null;

  const priority = PRIORITIES.includes(body.priority ?? "") ? (body.priority as string) : "Medium";
  const status = STATUSES.includes(body.status ?? "")
    ? (body.status as WsTaskStatus)
    : WsTaskStatus.NotStarted;
  const done = status === WsTaskStatus.Done;

  // Tenant-scoped validation for source message.
  let sourceMessageId: string | null = null;
  if (body.sourceMessageId) {
    const msg = await prisma.wsMessage.findFirst({
      where: { id: body.sourceMessageId, companyId: user.companyId },
      include: { channel: { select: { id: true, kind: true } } },
    });
    if (msg) {
      if (msg.channel.kind === "team") {
        const member = await prisma.wsChannelMember.findUnique({
          where: { channelId_userId: { channelId: msg.channel.id, userId: user.id } },
        });
        if (member) sourceMessageId = msg.id;
      } else {
        sourceMessageId = msg.id;
      }
    }
  }

  const task = await prisma.wsTask.create({
    data: {
      companyId: user.companyId,
      createdById: user.id,
      assigneeId: primaryAssigneeId,
      title,
      priority,
      status,
      isPrivate,
      done,
      doneAt: done ? new Date() : null,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      linkType: body.linkType ?? null,
      linkId: body.linkId ?? null,
      linkLabel: body.linkLabel ?? null,
      spaceId,
      sourceMessageId,
      parentTaskId,
      assignees: assigneeIds.length
        ? { create: assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
  });

  await prisma.wsTaskActivity
    .create({ data: { taskId: task.id, userId: user.id, action: "created" } })
    .catch(() => undefined);

  if (sourceMessageId) {
    await prisma.wsMessage
      .update({ where: { id: sourceMessageId }, data: { convertedTaskId: task.id } })
      .catch(() => undefined);
  }

  // Notify each assignee (don't self-notify).
  const creatorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
  for (const assigneeId of assigneeIds) {
    if (assigneeId === user.id) continue;
    await enqueueWorkspaceInApp({
      companyId: user.companyId,
      userId: assigneeId,
      event: "workspace.task.assigned",
      title: `New task: ${title}`,
      body: `${creatorName} assigned you a task${task.dueDate ? ` due ${task.dueDate.toLocaleDateString()}` : ""}.`,
      link: "/command-center",
      urgent: priority === "Urgent",
      dedupeKey: `task:${task.id}:assigned:${assigneeId}`,
    });
  }

  return NextResponse.json({ id: task.id });
}
