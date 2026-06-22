import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { Prisma, ContactType } from "@prisma/client";
import { isTradeCategory } from "@/lib/tradeCategories";

export const dynamic = "force-dynamic";

type Body = {
  meta?: Record<string, unknown>;
  type?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  rating?: number | null;
  title?: string | null;
  website?: string | null;
  tradeCategory?: string | null;
};

const CONTACT_TYPES = new Set<string>(Object.values(ContactType));

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const prevMeta =
    contact.meta && typeof contact.meta === "object"
      ? (contact.meta as Record<string, unknown>)
      : {};
  const mergedMeta: Record<string, unknown> = { ...prevMeta };
  if (body.meta && typeof body.meta === "object") {
    Object.assign(mergedMeta, body.meta);
  }

  const data: Prisma.ContactUpdateInput = {
    meta: mergedMeta as Prisma.InputJsonValue,
  };
  if (body.name !== undefined) {
    const trimmed = body.name?.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = trimmed;
  }
  if (body.type !== undefined && body.type !== null) {
    if (!CONTACT_TYPES.has(body.type)) {
      return NextResponse.json({ error: "Invalid contact type" }, { status: 400 });
    }
    data.type = body.type as ContactType;
  }
  if (body.company !== undefined) data.company = body.company?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim() || null;
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.address !== undefined) data.address = body.address?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.rating !== undefined) {
    if (body.rating === null) {
      data.rating = null;
    } else {
      const r = Math.round(Number(body.rating));
      data.rating = Number.isFinite(r) ? Math.min(5, Math.max(1, r)) : null;
    }
  }
  if (body.title !== undefined) data.title = body.title?.trim() || null;
  if (body.website !== undefined) data.website = body.website?.trim() || null;
  if (body.tradeCategory !== undefined) {
    data.tradeCategory = isTradeCategory(body.tradeCategory) ? body.tradeCategory : null;
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data,
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "contact.update",
      entity: "Contact",
      entityId: updated.id,
      message: `Updated contact ${updated.name}`,
      meta: { contactId: updated.id },
    },
  });

  return NextResponse.json({ ok: true, contact: updated });
}
