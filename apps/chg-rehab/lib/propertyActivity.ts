import { prisma } from "@/lib/prisma";

export type PropertyActivityKind =
  | "task_created"
  | "task_completed"
  | "document_uploaded"
  | "log";

export type PropertyActivityEvent = {
  id: string;
  kind: PropertyActivityKind;
  label: string;
  at: string;
};

/**
 * Aggregate recent activity for a single property: workspace task
 * creations/completions (linkType=property), document uploads, and any
 * generic activity-log entries tied to the property or its project.
 */
export async function getPropertyActivity(
  companyId: string,
  propertyId: string,
  limit = 20,
): Promise<PropertyActivityEvent[]> {
  const [tasks, docs, project] = await Promise.all([
    prisma.wsTask.findMany({
      where: { companyId, linkType: "property", linkId: propertyId },
      select: { id: true, title: true, createdAt: true, done: true, doneAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.document.findMany({
      where: { companyId, propertyId },
      select: { id: true, name: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
      take: limit,
    }),
    prisma.project.findFirst({
      where: { companyId, propertyId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const logs = await prisma.activityLogEntry.findMany({
    where: { companyId, OR: [{ entityId: propertyId }, { entityId: project?.id || "_none_" }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const events: PropertyActivityEvent[] = [];
  for (const t of tasks) {
    events.push({ id: `task-created-${t.id}`, kind: "task_created", label: `Task created: ${t.title}`, at: t.createdAt.toISOString() });
    if (t.done && t.doneAt) {
      events.push({ id: `task-completed-${t.id}`, kind: "task_completed", label: `Task completed: ${t.title}`, at: t.doneAt.toISOString() });
    }
  }
  for (const d of docs) {
    events.push({ id: `doc-${d.id}`, kind: "document_uploaded", label: `Document uploaded: ${d.name}`, at: d.uploadedAt.toISOString() });
  }
  for (const l of logs) {
    events.push({ id: `log-${l.id}`, kind: "log", label: l.message || l.action, at: l.createdAt.toISOString() });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, limit);
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}
