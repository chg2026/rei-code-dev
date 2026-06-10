import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function authorizeTask(taskId: string, companyId: string) {
  return prisma.pmTask.findFirst({
    where: { id: taskId, list: { space: { companyId } } },
  });
}

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await authorizeTask(params.taskId, user.companyId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  await prisma.pmTaskAssignee.upsert({
    where: { taskId_userId: { taskId: params.taskId, userId: body.userId } },
    create: { taskId: params.taskId, userId: body.userId },
    update: {},
  });

  await prisma.pmActivity.create({
    data: { taskId: params.taskId, userId: user.id, type: "assignee_added", data: { assigneeId: body.userId } },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await authorizeTask(params.taskId, user.companyId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  await prisma.pmTaskAssignee.deleteMany({
    where: { taskId: params.taskId, userId: body.userId },
  });

  return NextResponse.json({ ok: true });
}
