import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { assertValidStoredUpload } from "@/lib/serverFileValidation";

export const dynamic = "force-dynamic";

/** Object paths minted by /api/uploads/request-url are always `uploads/<uuid>`. */
const OBJECT_PATH_RE = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attach a signed lien waiver to a draw. Stores the object path in
 * `lienWaiverDocId` and flips `lienWaiverReceived`, which the strict payment
 * gate (assertDrawPayable) checks before a draw can be marked paid.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const draw = await prisma.draw.findFirst({
    where: { id, project: { companyId: user.companyId } },
    select: { id: true, number: true, projectId: true },
  });
  if (!draw) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const fileKey = body && typeof body.fileKey === "string" ? body.fileKey : "";
  if (!OBJECT_PATH_RE.test(fileKey)) {
    return NextResponse.json({ error: "A valid uploaded file is required" }, { status: 400 });
  }
  try {
    await assertValidStoredUpload(fileKey);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid upload" },
      { status: 400 }
    );
  }

  const updated = await prisma.draw.update({
    where: { id: draw.id },
    data: { lienWaiverDocId: fileKey, lienWaiverReceived: true },
    select: { id: true, lienWaiverDocId: true, lienWaiverReceived: true },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw.lien_waiver.received",
      entity: "Draw",
      entityId: draw.id,
      message: `Lien waiver received for Draw #${draw.number}.`,
      meta: { type: "document", drawId: draw.id, drawNumber: draw.number, projectId: draw.projectId },
    },
  });

  return NextResponse.json({ ok: true, draw: updated });
}
