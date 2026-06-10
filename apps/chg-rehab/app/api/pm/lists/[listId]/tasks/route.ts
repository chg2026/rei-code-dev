import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function personName(u: { firstName: string | null; lastName: string | null; email: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "User";
}
function personInitials(u: { firstName: string | null; lastName: string | null; initials: string | null }) {
  return (u.initials || [(u.firstName ?? "")[0], (u.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase();
}
const isDone = (s: { type: string } | null) => !!s && (s.type === "done" || s.type === "closed");

export async function GET(req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listId } = await params;

  const list = await prisma.pmList.findFirst({ where: { id: listId, space: { companyId: user.companyId } } });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const statusId = url.searchParams.get("statusId");
  const assigneeId = url.searchParams.get("assigneeId");
  const priority = url.searchParams.get("priority");
  const done = url.searchParams.get("done") === "1";
  const withSubtasks = url.searchParams.get("subtasks") === "1";

  const where: Record<string, unknown> = { listId };
  if (!withSubtasks) where.parentTaskId = null;
  if (statusId) where.statusId = statusId;
  if (priority) where.priority = priority;
  if (assigneeId) where.assignees = { some: { userId: assigneeId } };
  if (done) where.status = { type: { in: ["done", "closed"] } };

  const tasks = await prisma.pmTask.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    include: {
      status: { select: { id: true, name: true, color: true, type: true } },
      assignees: {
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } },
      },
      _count: { select: { subtasks: true } },
    },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      taskType: t.taskType ?? "task",
      priority: t.priority,
      statusId: t.statusId,
      status: t.status,
      parentTaskId: t.parentTaskId,
      startDate: t.startDate?.toISOString() ?? null,
      dueDate: t.dueDate?.toISOString() ?? null,
      doneDate: isDone(t.status) ? t.updatedAt.toISOString() : null,
      subtaskCount: t._count.subtasks,
      assignees: t.assignees.map((a) => ({ id: a.user.id, name: personName(a.user), initials: personInitials(a.user) })),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listId } = await params;

  const list = await prisma.pmList.findFirst({
    where: { id: listId, space: { companyId: user.companyId } },
    select: { id: true, spaceId: true },
  });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    statusId?: string;
    priority?: string;
    dueDate?: string;
    startDate?: string;
    assigneeIds?: string[];
    parentTaskId?: string;
  };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Resolve optional parent (for subtasks); must belong to the same list.
  let parentTaskId: string | null = null;
  if (body.parentTaskId) {
    const parent = await prisma.pmTask.findFirst({
      where: { id: body.parentTaskId, listId },
      select: { id: true },
    });
    parentTaskId = parent?.id ?? null;
  }

  // Resolve status: explicit (validated against this list's space) or the
  // space's default. A status from another space must not be accepted.
  let statusId: string | null = null;
  if (body.statusId) {
    const st = await prisma.pmStatus.findFirst({
      where: { id: body.statusId, spaceId: list.spaceId },
      select: { id: true },
    });
    statusId = st?.id ?? null;
  }
  if (!statusId) {
    const def = await prisma.pmStatus.findFirst({
      where: { spaceId: list.spaceId, isDefault: true },
      select: { id: true },
      orderBy: { order: "asc" },
    });
    statusId = def?.id ?? null;
  }

  // Validate assignees belong to the same company.
  let assigneeIds: string[] = [];
  if (Array.isArray(body.assigneeIds) && body.assigneeIds.length) {
    const members = await prisma.user.findMany({
      where: { id: { in: body.assigneeIds }, companyId: user.companyId, active: true },
      select: { id: true },
    });
    assigneeIds = members.map((m) => m.id);
  }

  const task = await prisma.pmTask.create({
    data: {
      listId,
      parentTaskId,
      name,
      description: body.description ?? null,
      statusId,
      priority: body.priority ?? "normal",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      assignees: assigneeIds.length ? { create: assigneeIds.map((id) => ({ userId: id })) } : undefined,
    },
  });

  await prisma.pmActivity.create({
    data: { taskId: task.id, userId: user.id, type: "task_created" },
  });

  return NextResponse.json({ id: task.id });
}
