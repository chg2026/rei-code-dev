import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { done?: boolean; title?: string; priority?: string; dueDate?: string | null; description?: string | null; assigneeId?: string | null };

  const existing = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    data.done = body.done;
    data.doneAt = body.done ? new Date() : null;
  }
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.priority && ["Urgent", "Medium", "Low"].includes(body.priority)) data.priority = body.priority;
  if (typeof body.dueDate !== "undefined") data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.assigneeId !== "undefined") {
    if (body.assigneeId === null) {
      data.assigneeId = null;
    } else {
      const member = await prisma.user.findFirst({ where: { id: body.assigneeId, companyId: user.companyId, active: true } });
      if (member) data.assigneeId = member.id;
    }
  }

  const updated = await prisma.wsTask.update({ where: { id }, data });

  // Notify creator when a task they assigned to someone else gets completed.
  if (
    typeof body.done === "boolean" &&
    body.done &&
    !existing.done &&
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

  return NextResponse.json({ id: updated.id, done: updated.done });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.wsTask.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    task: {
      id: task.id, title: task.title, priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null, done: task.done,
      description: task.description ?? null, linkLabel: task.linkLabel ?? null,
      createdAt: task.createdAt.toISOString(),
      assignee: task.assignee ? {
        id: task.assignee.id,
        name: [task.assignee.firstName, task.assignee.lastName].filter(Boolean).join(" ") || task.assignee.email || "User",
        initials: (task.assignee.initials || [(task.assignee.firstName ?? "")[0], (task.assignee.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase(),
      } : null,
    }
  });
}
