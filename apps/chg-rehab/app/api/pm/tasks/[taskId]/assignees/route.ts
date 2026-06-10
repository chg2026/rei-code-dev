import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function ownedTask(companyId: string, taskId: string) {
  return prisma.pmTask.findFirst({
    where: { id: taskId, list: { space: { companyId } } },
    select: { id: true },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;
  if (!(await ownedTask(user.companyId, taskId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: { id: body.userId, companyId: user.companyId, active: true },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  await prisma.pmTaskAssignee.upsert({
    where: { taskId_userId: { taskId, userId: target.id } },
    create: { taskId, userId: target.id },
    update: {},
  });
  await prisma.pmActivity.create({
    data: { taskId, userId: user.id, type: "assignee_added", data: { userId: target.id } },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;
  if (!(await ownedTask(user.companyId, taskId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.pmTaskAssignee
    .delete({ where: { taskId_userId: { taskId, userId: body.userId } } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
