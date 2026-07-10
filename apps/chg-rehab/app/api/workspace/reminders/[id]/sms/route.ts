import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { labelForMinutes, syncReminderSms, type LeadTime } from "@/lib/workspace/reminderSms";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/reminders/[id]/sms
 *
 * Returns the current user's pending SMS lead times for this reminder (so the
 * card can pre-fill on edit). Sent/failed rows are history and not returned.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const reminder = await prisma.wsReminder.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.wsReminderSms.findMany({
    where: { reminderId: id, userId: user.id, status: "pending" },
    orderBy: { minutesBefore: "asc" },
    select: { minutesBefore: true, leadLabel: true, scheduledFor: true },
  });

  return NextResponse.json({
    leadTimes: rows.map((r) => ({
      minutesBefore: r.minutesBefore,
      leadLabel: r.leadLabel ?? labelForMinutes(r.minutesBefore),
      scheduledFor: r.scheduledFor.toISOString(),
    })),
  });
}

/**
 * PUT /api/workspace/reminders/[id]/sms
 *
 * Replace the set of pending SMS lead times for this reminder (per user).
 * Body: { leadTimes: number[] } — minutes-before values. Requires a verified
 * phone; otherwise 409 so the client can surface the "verify your phone" note.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const reminder = await prisma.wsReminder.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, dueDate: true, dueTime: true },
  });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phoneVerified: true, timezone: true },
  });
  if (!account?.phoneVerified) {
    return NextResponse.json(
      { error: "Verify a phone number in Profile settings to enable SMS reminders." },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { leadTimes?: unknown };
  const raw = Array.isArray(body.leadTimes) ? body.leadTimes : [];
  const seen = new Set<number>();
  const leadTimes: LeadTime[] = [];
  for (const v of raw) {
    const minutesBefore = Math.round(Number(v));
    if (!Number.isFinite(minutesBefore) || minutesBefore <= 0) continue;
    // Cap at 30 days out; guards against absurd custom values.
    if (minutesBefore > 43_200) continue;
    if (seen.has(minutesBefore)) continue;
    seen.add(minutesBefore);
    leadTimes.push({ minutesBefore, leadLabel: labelForMinutes(minutesBefore) });
  }

  await syncReminderSms({
    reminderId: reminder.id,
    userId: user.id,
    companyId: user.companyId,
    dueDate: reminder.dueDate,
    dueTime: reminder.dueTime,
    timeZone: account.timezone ?? "America/New_York",
    leadTimes,
  });

  return NextResponse.json({ ok: true, count: leadTimes.length });
}
