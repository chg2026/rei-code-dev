import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function authorizeTask(taskId: string, companyId: string) {
  return prisma.pmTask.findFirst({
    where: { id: taskId, list: { space: { companyId } } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await prisma.pmTask.findFirst({
    where: { id: params.taskId, list: { space: { companyId: user.companyId } } },
    include: {
      status: true,
      assignees: {
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
      },
      subtasks: {
        include: {
          status: true,
          assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
      tags: { include: { tag: true } },
      comments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
        orderBy: { createdAt: "asc" },
      },
      activity: {
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await authorizeTask(params.taskId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const prevStatusId = existing.statusId;

  const task = await prisma.pmTask.update({
    where: { id: params.taskId },
    data: {
      ...(body.name        !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.statusId    !== undefined && { statusId: body.statusId }),
      ...(body.priority    !== undefined && { priority: body.priority }),
      ...(body.dueDate     !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.startDate   !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
      ...(body.taskType    !== undefined && { taskType: body.taskType }),
      ...(body.timeEstimate  !== undefined && { timeEstimate: body.timeEstimate }),
      ...(body.sprintPoints  !== undefined && { sprintPoints: body.sprintPoints }),
      ...(body.parentTaskId  !== undefined && { parentTaskId: body.parentTaskId }),
    },
    include: { status: true },
  });

  if (body.statusId !== undefined && body.statusId !== prevStatusId) {
    await prisma.pmActivity.create({
      data: {
        taskId: params.taskId,
        userId: user.id,
        type: "status_changed",
        data: { from: prevStatusId, to: body.statusId },
      },
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await authorizeTask(params.taskId, user.companyId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pmTask.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}
