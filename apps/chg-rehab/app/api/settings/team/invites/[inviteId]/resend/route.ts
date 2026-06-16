import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, publicOrigin } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";

const INVITE_TTL_DAYS = 14;

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { inviteId } = await params;
  if (!inviteId)
    return NextResponse.json({ error: "Missing invite id" }, { status: 400 });

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.companyId !== me.companyId)
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "Pending")
    return NextResponse.json(
      { error: "Invite is no longer pending" },
      { status: 409 }
    );

  // Reset the expiry window so the resent link is valid again.
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.invite.update({
    where: { id: inviteId },
    data: { expiresAt },
  });

  const joinUrl = `${publicOrigin(req)}/api/invites/accept?token=${encodeURIComponent(
    invite.token
  )}`;
  const inviterName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || "An admin";
  const company = await prisma.company.findUnique({
    where: { id: me.companyId },
    select: { name: true },
  });

  const send = await sendInviteEmail({
    to: invite.email,
    inviterName,
    companyName: company?.name ?? "your company",
    role: invite.role,
    joinUrl,
    expiresAt,
  }).catch((err) => {
    console.error("[settings/team/invites/resend] sendInviteEmail threw", err);
    return { delivered: false, reason: "transport_error" } as const;
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "user_invite_resent",
      entity: "Invite",
      entityId: invite.id,
      message: `Resent invite to ${invite.email}`,
      meta: {
        email: invite.email,
        role: invite.role,
        emailDelivered: send.delivered,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    emailDelivered: send.delivered,
    joinUrl,
  });
}
