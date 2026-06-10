import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/workspace/calendar?month=YYYY-MM — returns calendar events for the
 * given month, drawn from:
 *  - tasks with a dueDate
 *  - upcoming pipeline closings (expected close date from deal.meta.closingDate)
 *  - actual pipeline closings (closedAt) for history within the month
 *  - project phase milestones (Phase start/end dates)
 *  - document expirations
 *  - investor distribution scheduled dates
 *  - manual WsCalendarEvent rows
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const monthStr = url.searchParams.get("month");
  const now = new Date();
  const [yStr, mStr] = (monthStr ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const range = { gte: start, lt: end };

  const [tasks, closedDeals, openDeals, phases, docs, dists, manual] = await Promise.all([
    prisma.wsTask.findMany({
      where: { companyId: user.companyId, dueDate: range },
      select: { id: true, title: true, dueDate: true, priority: true },
    }),
    // Actual closings recorded in this month (history).
    prisma.pipelineDeal.findMany({
      where: { companyId: user.companyId, closedAt: range },
      select: { id: true, address: true, code: true, closedAt: true },
    }),
    // Open deals whose expected closing date (meta.closingDate) may land in-month.
    prisma.pipelineDeal.findMany({
      where: { companyId: user.companyId, closedAt: null },
      select: { id: true, address: true, meta: true },
      take: 300,
    }),
    // Project phase milestones (start/end) — the closest thing to milestones.
    prisma.phase.findMany({
      where: {
        project: { companyId: user.companyId },
        OR: [{ startDate: range }, { endDate: range }],
      },
      select: {
        id: true,
        name: true,
        number: true,
        startDate: true,
        endDate: true,
        project: { select: { name: true } },
      },
    }),
    prisma.document.findMany({
      where: { companyId: user.companyId, status: "Active", expiresAt: range },
      select: { id: true, name: true, expiresAt: true, category: true },
    }),
    prisma.distribution.findMany({
      where: { offering: { companyId: user.companyId }, paidOn: range },
      select: { id: true, paidOn: true, totalAmount: true },
    }).catch(() => [] as { id: string; paidOn: Date | null; totalAmount: unknown }[]),
    prisma.wsCalendarEvent.findMany({
      where: { companyId: user.companyId, startAt: range },
      select: { id: true, title: true, startAt: true, link: true },
    }),
  ]);

  type Ev = { id: string; title: string; when: string; kind: string; link: string | null };
  const events: Ev[] = [];

  for (const t of tasks) {
    if (t.dueDate) events.push({ id: `task:${t.id}`, title: t.title, when: t.dueDate.toISOString(), kind: "task", link: "/command-center" });
  }

  for (const d of openDeals) {
    const meta = (d.meta as Record<string, unknown> | null) ?? {};
    const raw = meta.closingDate;
    if (typeof raw !== "string" && !(raw instanceof Date)) continue;
    const cd = new Date(raw as string | Date);
    if (Number.isNaN(cd.getTime()) || cd < start || cd >= end) continue;
    events.push({
      id: `deal-expected:${d.id}`,
      title: `Expected closing: ${d.address}`,
      when: cd.toISOString(),
      kind: "deal",
      link: "/pipeline",
    });
  }

  for (const d of closedDeals) {
    if (d.closedAt) events.push({ id: `deal-closed:${d.id}`, title: `Deal closed: ${d.address}`, when: d.closedAt.toISOString(), kind: "deal", link: "/pipeline" });
  }

  for (const p of phases) {
    const label = `Phase ${p.number}: ${p.name}`;
    const proj = p.project?.name ? ` (${p.project.name})` : "";
    if (p.startDate && p.startDate >= start && p.startDate < end) {
      events.push({ id: `phase-start:${p.id}`, title: `${label} starts${proj}`, when: p.startDate.toISOString(), kind: "milestone", link: "/rehab" });
    }
    if (p.endDate && p.endDate >= start && p.endDate < end) {
      events.push({ id: `phase-end:${p.id}`, title: `${label} due${proj}`, when: p.endDate.toISOString(), kind: "milestone", link: "/rehab" });
    }
  }

  for (const d of docs) {
    if (d.expiresAt) events.push({ id: `doc:${d.id}`, title: `${d.name} expires`, when: d.expiresAt.toISOString(), kind: "doc", link: "/docs" });
  }
  for (const dist of dists as Array<{ id: string; paidOn: Date | null }>) {
    if (dist.paidOn) events.push({ id: `dist:${dist.id}`, title: "Investor distribution", when: dist.paidOn.toISOString(), kind: "distribution", link: "/investor-portal" });
  }
  for (const e of manual) {
    events.push({ id: `cal:${e.id}`, title: e.title, when: e.startAt.toISOString(), kind: "event", link: e.link });
  }

  events.sort((a, b) => a.when.localeCompare(b.when));

  return NextResponse.json({ month: `${y}-${String(m).padStart(2, "0")}`, events });
}
