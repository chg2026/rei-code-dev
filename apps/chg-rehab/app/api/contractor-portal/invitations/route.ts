import { NextRequest, NextResponse } from "next/server";
import { ContactType, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { contractorProjectInvitationRoleKey } from "@/lib/contractorProjectInvitationState";
import {
  buildContractorInviteJoinUrl,
  createContractorInviteToken,
  sendContractorProjectInvitationEmail,
} from "@/lib/contractorProjectInvitationEmail";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_TTL_DAYS = 30;

function safeInvitation(invitation: {
  id: string;
  status: string;
  emailSnapshot: string;
  role: string;
  roleKey: string;
  trade: string | null;
  agreementVersion: string;
  invitedAt: Date;
  expiresAt: Date;
  documentGateState: string;
  complianceGateState: string;
  cpAccountId: string | null;
  inviteDeliveryStatus: string;
  inviteSentAt: Date | null;
  inviteDeliveryMessageId: string | null;
  inviteDeliveryError: string | null;
  contact: { id: string; name: string; email: string | null; type: ContactType };
  project: { id: string; code: string; name: string };
}) {
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

const invitationInclude = {
  contact: { select: { id: true, name: true, email: true, type: true } },
  project: { select: { id: true, code: true, name: true } },
} as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, companyId: user.companyId },
        select: { id: true },
      })
    : null;
  if (projectId && !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const invitations = await prisma.contractorProjectInvitation.findMany({
    where: { companyId: user.companyId, ...(project ? { projectId: project.id } : {}) },
    include: invitationInclude,
    orderBy: { invitedAt: "desc" },
  });

  return NextResponse.json({ invitations: invitations.map(safeInvitation) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    projectId?: unknown;
    contactId?: unknown;
    role?: unknown;
    agreementVersion?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const agreementVersion = typeof body.agreementVersion === "string" ? body.agreementVersion.trim() : "";
  if (!projectId || !contactId || !role || !agreementVersion) {
    return NextResponse.json(
      { error: "projectId, contactId, role, and agreementVersion are required" },
      { status: 400 },
    );
  }

  const [project, contact] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: { id: true, code: true, name: true },
    }),
    prisma.contact.findFirst({
      where: { id: contactId, companyId: user.companyId },
      select: { id: true, name: true, email: true, type: true, trade: true },
    }),
  ]);
  if (!project || !contact) return NextResponse.json({ error: "Project or contact not found" }, { status: 404 });
  if (contact.type !== ContactType.Contractor && contact.type !== ContactType.Subcontractor) {
    return NextResponse.json({ error: "Contact must be a contractor or subcontractor" }, { status: 400 });
  }

  const emailSnapshot = contact.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(emailSnapshot)) {
    return NextResponse.json({ error: "Contractor contact must have a valid email" }, { status: 400 });
  }
  const roleKey = contractorProjectInvitationRoleKey(role);
  if (!roleKey) return NextResponse.json({ error: "role is required" }, { status: 400 });
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.contractorProjectInvitation.findUnique({
        where: { companyId_projectId_contactId_roleKey: { companyId: user.companyId, projectId: project.id, contactId: contact.id, roleKey } },
        include: invitationInclude,
      });
      if (existing) return { invitation: existing, duplicate: true as const };

      const cpAccount = await tx.cpAccount.findUnique({ where: { email: emailSnapshot }, select: { id: true } });
      const { rawToken, tokenHash } = createContractorInviteToken();
      const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
      const invitation = await tx.contractorProjectInvitation.create({
        data: {
          companyId: user.companyId,
          projectId: project.id,
          contactId: contact.id,
          cpAccountId: cpAccount?.id ?? null,
          emailSnapshot,
          role,
          roleKey,
          trade: contact.trade,
          agreementVersion,
          expiresAt,
          inviteTokenHash: tokenHash,
          inviteTokenExpiresAt: expiresAt,
          inviteDeliveryStatus: "Pending",
          invitedById: user.id,
        },
        include: invitationInclude,
      });
      await tx.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "contractor_project_invitation.create",
          entity: "ContractorProjectInvitation",
          entityId: invitation.id,
          message: `Invited ${contact.name} to ${project.code} as ${role}`,
          meta: { projectId: project.id, contactId: contact.id, roleKey, agreementVersion },
        },
      });
      return { invitation, duplicate: false, rawToken };
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, invitation: safeInvitation(result.invitation) });
    }

    const delivery = await sendContractorProjectInvitationEmail({
      to: result.invitation.emailSnapshot,
      inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "CHG Rehab",
      companyName: company.name,
      projectCode: project.code,
      projectName: project.name,
      role: result.invitation.role,
      joinUrl: buildContractorInviteJoinUrl(result.rawToken),
      expiresAt: result.invitation.expiresAt,
    });
    const invitation = await prisma.contractorProjectInvitation.update({
      where: { id: result.invitation.id },
      data: {
        inviteDeliveryStatus: delivery.delivered ? "Delivered" : "Failed",
        inviteSentAt: delivery.delivered ? new Date() : null,
        inviteDeliveryMessageId: delivery.messageId ?? null,
        inviteDeliveryError: delivery.delivered ? null : (delivery.reason ?? "delivery_failed"),
      },
      include: invitationInclude,
    });
    return NextResponse.json({ ok: true, duplicate: false, invitation: safeInvitation(invitation) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.contractorProjectInvitation.findUnique({
        where: { companyId_projectId_contactId_roleKey: { companyId: user.companyId, projectId: project.id, contactId: contact.id, roleKey } },
        include: invitationInclude,
      });
      if (existing) return NextResponse.json({ ok: true, duplicate: true, invitation: safeInvitation(existing) });
    }
    throw error;
  }
}
