import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function authorizeTask(taskId: string, companyId: string) {
  return prisma.pmTask.findFirst({
    where: { id: taskId, list: { space: { companyId } } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await authorizeTask(taskId, user.companyId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comments = await prisma.pmComment.findMany({
    where: { taskId },
    include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await authorizeTask(taskId, user.companyId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.body?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const comment = await prisma.pmComment.create({
    data: { taskId, userId: user.id, body: body.body.trim() },
    include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
  });

  await prisma.pmActivity.create({
    data: { taskId, userId: user.id, type: "comment_added" },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
