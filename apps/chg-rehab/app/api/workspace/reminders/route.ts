import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyReminderMentions } from "@/lib/workspace/reminderMentions";

export const dynamic = "force-dynamic";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const URGENCIES = new Set(["low", "medium", "high", "urgent"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * GET /api/workspace/reminders — returns a unified, derived feed:
 *  - documents expiring within 30 days
 *  - tasks overdue (dueDate < now and not done)
 *  - user-created WsReminder rows (with full editable fields)
 *  - pipeline deals that have stalled
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  // A pipeline deal is "stuck" when it is still open (not closed) and has not
  // been touched in 14+ days; 30+ days idle is treated as urgent.
  const STUCK_MS = 14 * 24 * 60 * 60 * 1000;
  const URGENT_STUCK_MS = 30 * 24 * 60 * 60 * 1000;
  const stuckBefore = new Date(now.getTime() - STUCK_MS);

  const [expDocs, overdueTasks, manual, stuckDeals] = await Promise.all([
    prisma.document.findMany({
      where: {
        companyId: user.companyId,
        status: "Active",
        expiresAt: { not: null, gte: now, lte: horizon },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
    }),
    prisma.wsTask.findMany({
      where: { companyId: user.companyId, done: false, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    prisma.wsReminder.findMany({
      where: { companyId: user.companyId, done: false, dismissed: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 100,
    }),
    prisma.pipelineDeal.findMany({
      where: { companyId: user.companyId, closedAt: null, updatedAt: { lt: stuckBefore } },
      orderBy: { updatedAt: "asc" },
      take: 50,
    }),
  ]);

  type Item = {
    id: string;
    title: string;
    source: string;
    link: string | null;
    when: string | null;
    urgent: boolean;
    kind: "doc" | "task" | "manual" | "deal";
    // manual-only editable fields
    reminderId?: string;
    notes?: string | null;
    tags?: string[];
    dueDate?: string | null;
    dueTime?: string | null;
    urgency?: string | null;
    assigneeId?: string | null;
    assigneeName?: string | null;
    assigneeInitials?: string | null;
  };

  // Resolve assignee display names for manual reminders in a single query.
  const assigneeIds = Array.from(
    new Set(manual.map((r) => r.assigneeId).filter((x): x is string => Boolean(x))),
  );
  const assigneeMap = new Map<string, { name: string; initials: string }>();
  if (assigneeIds.length) {
    const assignees = await prisma.user.findMany({
      where: { id: { in: assigneeIds }, companyId: user.companyId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    for (const a of assignees) {
      const name = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "User";
      assigneeMap.set(a.id, { name, initials: initialsFromName(name) });
    }
  }

  const items: Item[] = [];
  for (const d of expDocs) {
    const days = Math.ceil((d.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    items.push({
      id: `doc:${d.id}`,
      title: `${d.name} expires in ${days} day${days === 1 ? "" : "s"}`,
      source: `Documents hub · ${d.category}`,
      link: "/docs",
      when: d.expiresAt!.toISOString(),
      urgent: days <= 7,
      kind: "doc",
    });
  }
  for (const t of overdueTasks) {
    items.push({
      id: `task:${t.id}`,
      title: `Overdue: ${t.title}`,
      source: "My Tasks · To-do list",
      link: "/workspace/tasks",
      when: t.dueDate?.toISOString() ?? null,
      urgent: true,
      kind: "task",
    });
  }
  for (const r of manual) {
    items.push({
      id: `manual:${r.id}`,
      reminderId: r.id,
      title: r.title,
      source: r.source ?? "Reminder",
      link: r.link,
      when: r.dueDate ? `${r.dueDate}T${r.dueTime ?? "00:00"}` : r.remindAt?.toISOString() ?? null,
      urgent: r.urgency === "high" || r.urgency === "urgent" || r.urgent,
      kind: "manual",
      notes: r.notes,
      tags: r.tags ?? [],
      dueDate: r.dueDate,
      dueTime: r.dueTime,
      urgency: r.urgency ?? (r.urgent ? "high" : "medium"),
      assigneeId: r.assigneeId ?? null,
      assigneeName: r.assigneeId ? assigneeMap.get(r.assigneeId)?.name ?? null : null,
      assigneeInitials: r.assigneeId ? assigneeMap.get(r.assigneeId)?.initials ?? null : null,
    });
  }
  for (const d of stuckDeals) {
    const days = Math.floor((now.getTime() - d.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    items.push({
      id: `deal:${d.id}`,
      title: `Stuck deal: ${d.address} — no movement in ${days} days`,
      source: `Pipeline · ${d.stage}`,
      link: "/pipeline",
      when: d.updatedAt.toISOString(),
      urgent: now.getTime() - d.updatedAt.getTime() >= URGENT_STUCK_MS,
      kind: "deal",
    });
  }
  items.sort((a, b) => (a.when ?? "9999").localeCompare(b.when ?? "9999"));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    notes?: string | null;
    tags?: string[];
    dueDate?: string | null; // YYYY-MM-DD
    dueTime?: string | null; // HH:MM
    urgency?: string | null;
    assigneeId?: string | null;
    source?: string | null;
    link?: string | null;
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const urgency = body.urgency && URGENCIES.has(body.urgency) ? body.urgency : "medium";
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
    : [];
  if (body.dueDate && !DATE_RE.test(body.dueDate)) {
    return NextResponse.json({ error: "Invalid date format (expected YYYY-MM-DD)" }, { status: 400 });
  }
  if (body.dueTime && !TIME_RE.test(body.dueTime)) {
    return NextResponse.json({ error: "Invalid time format (expected HH:MM)" }, { status: 400 });
  }
  const notes = body.notes?.trim() || null;
  const assigneeId = await resolveAssigneeId(body.assigneeId, user.companyId);
  const r = await prisma.wsReminder.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      title,
      notes,
      tags,
      dueDate: body.dueDate || null,
      dueTime: body.dueTime || null,
      urgency,
      urgent: urgency === "high" || urgency === "urgent",
      assigneeId,
      source: body.source ?? null,
      link: body.link ?? null,
    },
  });
  await notifyReminderMentions({
    companyId: user.companyId,
    creatorId: user.id,
    reminderId: r.id,
    reminderTitle: title,
    notes,
  });
  return NextResponse.json({ id: r.id });
}

/**
 * Validates an assignee id belongs to an active user in the same company.
 * Returns the id when valid, null when empty/unset, and undefined to signal
 * an invalid id that callers should reject (kept simple: invalid -> null).
 */
async function resolveAssigneeId(
  raw: string | null | undefined,
  companyId: string,
): Promise<string | null> {
  const id = (raw ?? "").trim();
  if (!id) return null;
  const u = await prisma.user.findFirst({
    where: { id, companyId, active: true },
    select: { id: true },
  });
  return u ? u.id : null;
}
