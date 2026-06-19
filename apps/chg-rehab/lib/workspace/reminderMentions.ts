import { prisma } from "@/lib/prisma";

/**
 * Detects @FirstName mentions inside a reminder's notes, matches them to active
 * company users by first name (case-insensitive), and creates one in-app
 * Notification per mentioned user. De-duplicated per (reminder, user) via
 * dedupeKey so re-saving a reminder never re-notifies the same person, while a
 * newly-added mention on edit still fires. The reminder creator is never
 * notified about their own mention.
 */
export async function notifyReminderMentions(opts: {
  companyId: string;
  creatorId: string;
  reminderId: string;
  reminderTitle: string;
  notes: string | null | undefined;
}): Promise<void> {
  const { companyId, creatorId, reminderId, reminderTitle, notes } = opts;
  if (!notes) return;

  const tokens = new Set<string>();
  for (const match of notes.matchAll(/@([A-Za-z][A-Za-z0-9_'-]*)/g)) {
    tokens.add(match[1].toLowerCase());
  }
  if (tokens.size === 0) return;

  const users = await prisma.user.findMany({
    where: { companyId, active: true },
    select: { id: true, firstName: true, lastName: true },
  });

  const creator = users.find((u) => u.id === creatorId);
  const creatorName =
    (creator && [creator.firstName, creator.lastName].filter(Boolean).join(" ")) || "Someone";

  const matched = users.filter(
    (u) => u.firstName && tokens.has(u.firstName.toLowerCase()) && u.id !== creatorId,
  );
  if (matched.length === 0) return;

  await prisma.notification.createMany({
    data: matched.map((u) => ({
      companyId,
      userId: u.id,
      event: "reminder.mention",
      channel: "inApp",
      title: `${creatorName} mentioned you in a reminder: ${reminderTitle}`,
      link: "/workspace/calendar",
      status: "Sent",
      sentAt: new Date(),
      urgent: false,
      dedupeKey: `reminder-mention:${reminderId}:${u.id}`,
    })),
    skipDuplicates: true,
  });
}
