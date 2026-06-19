import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyReminderMentions } from "@/lib/workspace/reminderMentions";
export const dynamic = "force-dynamic";

const URGENCIES = new Set(["low", "medium", "high", "urgent"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const reminder = await prisma.wsReminder.findFirst({ where: { id, companyId: user.companyId } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    title?: string;
    notes?: string | null;
    tags?: string[];
    dueDate?: string | null;
    dueTime?: string | null;
    urgency?: string | null;
    assigneeId?: string | null;
    dismissed?: boolean;
  };

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "Title required" }, { status: 400 });
    data.title = t;
  }
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (Array.isArray(body.tags)) {
    data.tags = body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate && !DATE_RE.test(body.dueDate)) {
      return NextResponse.json({ error: "Invalid date format (expected YYYY-MM-DD)" }, { status: 400 });
    }
    data.dueDate = body.dueDate || null;
  }
  if (body.dueTime !== undefined) {
    if (body.dueTime && !TIME_RE.test(body.dueTime)) {
      return NextResponse.json({ error: "Invalid time format (expected HH:MM)" }, { status: 400 });
    }
    data.dueTime = body.dueTime || null;
  }
  if (body.urgency !== undefined && body.urgency && URGENCIES.has(body.urgency)) {
    data.urgency = body.urgency;
    data.urgent = body.urgency === "high" || body.urgency === "urgent";
  }
  if (body.assigneeId !== undefined) {
    const id = (body.assigneeId ?? "").trim();
    if (!id) {
      data.assigneeId = null;
    } else {
      const u = await prisma.user.findFirst({
        where: { id, companyId: user.companyId, active: true },
        select: { id: true },
      });
      data.assigneeId = u ? u.id : null;
    }
  }
  if (body.dismissed === true) {
    data.dismissed = true;
    data.done = true;
    data.doneAt = new Date();
    data.completedAt = new Date();
  }

  const updated = await prisma.wsReminder.update({ where: { id }, data });

  // Fire @mention notifications using the reminder's final notes/title.
  const finalNotes = data.notes !== undefined ? (data.notes as string | null) : reminder.notes;
  const finalTitle = (data.title as string | undefined) ?? reminder.title;
  await notifyReminderMentions({
    companyId: user.companyId,
    creatorId: user.id,
    reminderId: updated.id,
    reminderTitle: finalTitle,
    notes: finalNotes,
  });

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const reminder = await prisma.wsReminder.findFirst({ where: { id, companyId: user.companyId } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.wsReminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
