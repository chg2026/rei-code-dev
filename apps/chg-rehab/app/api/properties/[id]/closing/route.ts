import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseClosing, normalizeClosingItems, closingProgress, CLOSING_META_KEY } from "@/lib/property/closing";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function resolveProperty(id: string, companyId: string) {
  return prisma.property.findFirst({
    where: { id, companyId },
    select: { id: true, code: true, meta: true },
  });
}

/**
 * GET the closing checklist for a property. Seeds defaults in the response
 * when none are persisted yet, WITHOUT writing (a read must not mutate).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const property = await resolveProperty(id, user.companyId);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { items } = parseClosing(property.meta);
  return NextResponse.json({ items, progress: closingProgress(items) });
}

/**
 * PATCH replaces the closing items array. Merges into property.meta so no other
 * meta key is lost. Auth + company scope + billing gate + property-edit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const property = await resolveProperty(id, user.companyId);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const items = normalizeClosingItems((body as { items?: unknown }).items, user.id);
  if (items === null) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  const currentMeta =
    property.meta && typeof property.meta === "object" && !Array.isArray(property.meta)
      ? (property.meta as Record<string, unknown>)
      : {};
  const meta = { ...currentMeta, [CLOSING_META_KEY]: items } as Prisma.InputJsonValue;

  await prisma.property.update({ where: { id: property.id }, data: { meta } });

  const progress = closingProgress(items);
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "property.closing.updated",
      entity: "Property",
      entityId: property.id,
      message: `Closing checklist updated (${progress.done}/${progress.total} complete)`,
    },
  });

  return NextResponse.json({ items, progress });
}
