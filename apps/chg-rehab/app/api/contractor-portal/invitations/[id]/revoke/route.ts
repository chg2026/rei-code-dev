import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const invitationInclude = {
  contact: { select: { id: true, name: true, email: true, type: true } },
  project: { select: { id: true, code: true, name: true } },
} as const;

function safeInvitation(invitation: any) {
  return {
    id: invitation.id,
    status: invitation.status,
    emailSnapshot: invitation.emailSnapshot,
    role: invitation.role,
    roleKey: invitation.roleKey,
    trade: invitation.trade,
    agreementVersion: invitation.agreementVersion,
    invitedAt: invitation.invitedAt,
    expiresAt: invitation.expiresAt,
    documentGateState: invitation.documentGateState,
    complianceGateState: invitation.complianceGateState,
    cpAccountId: invitation.cpAccountId,
    inviteDeliveryStatus: invitation.inviteDeliveryStatus,
    inviteSentAt: invitation.inviteSentAt,
    inviteDeliveryMessageId: invitation.inviteDeliveryMessageId,
    contact: invitation.contact,
    project: invitation.project,
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const current = await prisma.contractorProjectInvitation.findFirst({
    where: { id, companyId: user.companyId },
    include: invitationInclude,
  });
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  const now = new Date();
  if (current.status !== "Pending" || current.expiresAt <= now) {
    return NextResponse.json({ error: "Only pending, unexpired invitations can be revoked" }, { status: 409 });
  }

  const revoked = await prisma.$transaction(async (tx) => {
    const claimed = await tx.contractorProjectInvitation.updateMany({
      where: {
        id,
        companyId: user.companyId,
        status: "Pending",
        expiresAt: { gt: now },
        inviteTokenHash: current.inviteTokenHash,
      },
      data: {
        status: "Revoked",
        revokedAt: now,
        revokedById: user.id,
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
      },
    });
    if (claimed.count !== 1) return null;

    const invitation = await tx.contractorProjectInvitation.findUnique({ where: { id }, include: invitationInclude });
    if (!invitation) return null;
    await tx.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "contractor_project_invitation.revoke",
        entity: "ContractorProjectInvitation",
        entityId: id,
        message: `Revoked contractor project invitation for ${invitation.contact.name}`,
        meta: { projectId: invitation.projectId, contactId: invitation.contactId, roleKey: invitation.roleKey },
      },
    });
    return invitation;
  });

  if (!revoked) return NextResponse.json({ error: "Invitation changed; retry revoke" }, { status: 409 });
  return NextResponse.json({ ok: true, invitation: safeInvitation(revoked) });
}
