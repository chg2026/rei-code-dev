import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/reminders/active — raw manual reminders for the
 * global due-reminder pop-up. Returns un-dismissed, un-completed reminders
 * that have a dueDate. The client decides which are "due now" using the
 * user's local clock (dueDate stored as a date-only string, dueTime HH:MM).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.wsReminder.findMany({
    where: {
      companyId: user.companyId,
      dismissed: false,
      done: false,
      dueDate: { not: null },
    },
    orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }],
    take: 100,
  });

  const reminders = rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    tags: r.tags ?? [],
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    urgency: r.urgency ?? (r.urgent ? "high" : "medium"),
  }));

  return NextResponse.json({ reminders });
}
