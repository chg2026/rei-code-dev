import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runNotificationSweep } from "@/lib/notifications/sweep";

/**
 * GET /api/workspace/notifications
 *
 * Unified Workspace notification feed for the current user (newest first,
 * up to 50) plus an `unreadCount`. Mirrors the legacy `/api/notifications`
 * feed but lives under the Workspace contract. Also kicks off a
 * fire-and-forget, internally throttled notification sweep as a backstop.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  runNotificationSweep(user.companyId).catch(() => undefined);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, channel: "inApp" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: user.id, channel: "inApp", readAt: null },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    items: items.map((n) => ({
      id: n.id,
      event: n.event,
      title: n.title,
      body: n.body,
      link: n.link,
      meta: n.meta,
      urgent: n.urgent,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/workspace/notifications
 *
 * Marks notifications read. Body `{ all: true }` marks every unread in-app
 * notification read; body `{ id }` marks a single one. Always scoped to the
 * current user.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };

  if (body.all) {
    const res = await prisma.notification.updateMany({
      where: { userId: user.id, channel: "inApp", readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: res.count });
  }

  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id or all required" }, { status: 400 });

  const n = await prisma.notification.findFirst({
    where: { id, userId: user.id, channel: "inApp" },
    select: { id: true },
  });
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true, updated: 1 });
}
