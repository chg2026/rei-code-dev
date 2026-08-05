import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  buildContractorInviteJoinUrl,
  createContractorInviteToken,
  sendContractorProjectInvitationEmail,
} from "@/lib/contractorProjectInvitationEmail";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set(["Accepted", "Declined", "Revoked", "Blocked", "Expired"]);

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const current = await prisma.contractorProjectInvitation.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      contact: { select: { id: true, name: true, email: true, type: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (TERMINAL_STATUSES.has(current.status) || current.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Invitation is no longer resendable" }, { status: 409 });
  }

  const { rawToken, tokenHash } = createContractorInviteToken();
  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.contractorProjectInvitation.updateMany({
      where: {
        id: current.id,
        companyId: user.companyId,
        status: "Pending",
        expiresAt: { gt: new Date() },
        inviteTokenHash: current.inviteTokenHash,
      },
      data: {
        inviteTokenHash: tokenHash,
        inviteTokenExpiresAt: current.expiresAt,
        inviteSentAt: null,
        inviteDeliveryStatus: "Pending",
        inviteDeliveryMessageId: null,
        inviteDeliveryError: null,
      },
    });
    if (claimed.count !== 1) return null;
    return tx.contractorProjectInvitation.findUnique({
      where: { id: current.id },
      include: {
        contact: { select: { id: true, name: true, email: true, type: true } },
        project: { select: { id: true, code: true, name: true } },
      },
    });
  });
  if (!rotated) return NextResponse.json({ error: "Invitation changed; retry resend" }, { status: 409 });

  const delivery = await sendContractorProjectInvitationEmail({
    to: rotated.emailSnapshot,
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "CHG Rehab",
    companyName: company.name,
    projectCode: rotated.project.code,
    projectName: rotated.project.name,
    role: rotated.role,
    joinUrl: buildContractorInviteJoinUrl(rawToken),
    expiresAt: rotated.expiresAt,
  });
  const invitation = await prisma.contractorProjectInvitation.update({
    where: { id: rotated.id },
    data: {
      inviteDeliveryStatus: delivery.delivered ? "Delivered" : "Failed",
      inviteSentAt: delivery.delivered ? new Date() : null,
      inviteDeliveryMessageId: delivery.messageId ?? null,
      inviteDeliveryError: delivery.delivered ? null : (delivery.reason ?? "delivery_failed"),
    },
    include: {
      contact: { select: { id: true, name: true, email: true, type: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    invitation: {
      id: invitation.id,
      status: invitation.status,
      emailSnapshot: invitation.emailSnapshot,
      role: invitation.role,
      roleKey: invitation.roleKey,
      trade: invitation.trade,
      agreementVersion: invitation.agreementVersion,
      invitedAt: invitation.invitedAt,
      expiresAt: invitation.expiresAt,
      inviteDeliveryStatus: invitation.inviteDeliveryStatus,
      inviteSentAt: invitation.inviteSentAt,
      inviteDeliveryMessageId: invitation.inviteDeliveryMessageId,
      contact: invitation.contact,
      project: invitation.project,
    },
  });
}
