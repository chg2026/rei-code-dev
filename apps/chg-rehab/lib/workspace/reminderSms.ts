import { prisma } from "../prisma";

/**
 * SMS reminder scheduling helpers.
 *
 * A reminder stores its due moment as wall-clock strings: `dueDate`
 * (YYYY-MM-DD) and `dueTime` (HH:MM), interpreted in the *user's* timezone.
 * To schedule a text N minutes before that, we must convert the wall time in
 * the user's zone to an absolute UTC instant, then subtract the lead time.
 */

export type LeadTime = { minutesBefore: number; leadLabel: string };

/** The fixed presets offered in the reminder card, in ascending order. */
export const SMS_LEAD_PRESETS: LeadTime[] = [
  { minutesBefore: 5, leadLabel: "5 minutes before" },
  { minutesBefore: 15, leadLabel: "15 minutes before" },
  { minutesBefore: 30, leadLabel: "30 minutes before" },
  { minutesBefore: 60, leadLabel: "1 hour before" },
  { minutesBefore: 120, leadLabel: "2 hours before" },
  { minutesBefore: 180, leadLabel: "3 hours before" },
  { minutesBefore: 1440, leadLabel: "1 day before" },
  { minutesBefore: 2880, leadLabel: "2 days before" },
];

/** Human label for an arbitrary (possibly custom) minutes-before value. */
export function labelForMinutes(minutes: number): string {
  const preset = SMS_LEAD_PRESETS.find((p) => p.minutesBefore === minutes);
  if (preset) return preset.leadLabel;
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} day${d === 1 ? "" : "s"} before`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"} before`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"} before`;
}

/**
 * The offset (ms) of `timeZone` relative to UTC at the given instant. Positive
 * means the zone is ahead of UTC. Uses Intl to read the zone's wall clock for
 * that instant and diffs it against the instant itself.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/**
 * Convert a wall time (`YYYY-MM-DD` + `HH:MM`) in `timeZone` to the absolute
 * UTC instant it represents. Runs the offset lookup twice so DST transitions
 * (where the naive-guess instant lands on the far side of a jump) resolve
 * correctly. Returns null when the inputs don't parse.
 */
export function zonedWallTimeToUtc(
  dueDate: string,
  dueTime: string | null,
  timeZone: string
): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!dm) return null;
  const time = dueTime && /^(\d{2}):(\d{2})$/.test(dueTime) ? dueTime : "00:00";
  const [h, mi] = time.split(":").map(Number);
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);

  // Naive guess: treat the wall time as if it were already UTC.
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset1 = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  const offset2 = zoneOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

/** Exact UTC send instant = due instant − lead time. */
export function computeScheduledFor(
  dueDate: string,
  dueTime: string | null,
  timeZone: string,
  minutesBefore: number
): Date | null {
  const due = zonedWallTimeToUtc(dueDate, dueTime, timeZone);
  if (!due) return null;
  return new Date(due.getTime() - minutesBefore * 60_000);
}

/**
 * Reconcile the pending SMS rows for one reminder to match `leadTimes`:
 *   - update the scheduledFor/leadLabel of pending rows that still apply
 *   - create rows for newly-added lead times
 *   - delete pending rows whose lead time was removed
 *
 * Only rows with status 'pending' are ever touched — already-sent/failed rows
 * are immutable history. When the reminder has no usable date, all pending
 * rows are removed (there is nothing to schedule against).
 */
export async function syncReminderSms(opts: {
  reminderId: string;
  userId: string;
  companyId: string;
  dueDate: string | null;
  dueTime: string | null;
  timeZone: string;
  leadTimes: LeadTime[];
}): Promise<void> {
  const { reminderId, userId, companyId, dueDate, dueTime, timeZone } = opts;

  const existing = await prisma.wsReminderSms.findMany({
    where: { reminderId, userId, status: "pending" },
  });

  // De-dupe requested lead times by minutesBefore (keep first label seen).
  const desired = new Map<number, LeadTime>();
  if (dueDate) {
    for (const lt of opts.leadTimes) {
      if (!Number.isFinite(lt.minutesBefore) || lt.minutesBefore < 0) continue;
      if (!desired.has(lt.minutesBefore)) desired.set(lt.minutesBefore, lt);
    }
  }

  // Delete pending rows whose lead time is no longer requested.
  const staleIds = existing
    .filter((e) => !desired.has(e.minutesBefore))
    .map((e) => e.id);
  if (staleIds.length) {
    await prisma.wsReminderSms.deleteMany({ where: { id: { in: staleIds } } });
  }

  // Upsert the requested lead times.
  for (const [minutesBefore, lt] of desired) {
    const scheduledFor = computeScheduledFor(dueDate!, dueTime, timeZone, minutesBefore);
    if (!scheduledFor) continue;
    const match = existing.find((e) => e.minutesBefore === minutesBefore);
    if (match) {
      await prisma.wsReminderSms.update({
        where: { id: match.id },
        data: { scheduledFor, leadLabel: lt.leadLabel, status: "pending" },
      });
    } else {
      await prisma.wsReminderSms.create({
        data: {
          companyId,
          reminderId,
          userId,
          scheduledFor,
          minutesBefore,
          leadLabel: lt.leadLabel,
          status: "pending",
        },
      });
    }
  }
}
