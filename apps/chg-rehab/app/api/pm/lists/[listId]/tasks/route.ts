import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function authorizeList(listId: string, companyId: string) {
  return prisma.pmList.findFirst({
    where: { id: listId, space: { companyId } },
  });
}

export async function GET(req: NextRequest, { params }: { params: { listId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await authorizeList(params.listId, user.companyId);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const statusId   = searchParams.get("statusId") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;
  const priority   = searchParams.get("priority") ?? undefined;
  const done       = searchParams.get("done") === "1";
  const subtasks   = searchParams.get("subtasks") === "1";

  const tasks = await prisma.pmTask.findMany({
    where: {
      listId: params.listId,
      ...(subtasks ? {} : { parentTaskId: null }),
      ...(statusId   ? { statusId }   : {}),
      ...(priority   ? { priority }   : {}),
      ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}),
      ...(done       ? { status: { type: "done" } } : {}),
    },
    include: {
      status: true,
      assignees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      },
      tags: { include: { tag: true } },
      _count: { select: { subtasks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest, { params }: { params: { listId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await authorizeList(params.listId, user.companyId);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const task = await prisma.pmTask.create({
    data: {
      listId: params.listId,
      name: body.name.trim(),
      description: body.description ?? null,
      statusId: body.statusId ?? null,
      priority: body.priority ?? "normal",
      parentTaskId: body.parentTaskId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      ...(body.assigneeIds?.length
        ? { assignees: { create: body.assigneeIds.map((uid: string) => ({ userId: uid })) } }
        : {}),
      activity: {
        create: { userId: user.id, type: "task_created" },
      },
    },
    include: {
      status: true,
      assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } } },
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
