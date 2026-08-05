import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { evaluateAssignmentCompliance } from "@/lib/assignmentGate";
import { ensureContractorPortalJob } from "@/lib/contractorPortalBridge";

export const dynamic = "force-dynamic";

const invitationInclude = {
  contact: { select: { id: true, name: true, email: true, type: true } },
  project: { select: { id: true, code: true, name: true } },
  cpAccount: {
    select: { id: true, email: true, contractorPortalEnabled: true },
  },
} as const;

function canonicalInvitation(invitation: any) {
  return {
    id: invitation.id,
    status: invitation.status,
    emailSnapshot: invitation.emailSnapshot,
    role: invitation.role,
    roleKey: invitation.roleKey,
    trade: invitation.trade,
    agreementVersion: invitation.agreementVersion,
    agreementAcceptedAt: invitation.agreementAcceptedAt,
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

function failure(error: string, status: 409 | 412, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const invitation = await prisma.contractorProjectInvitation.findFirst({
    where: { id, companyId: user.companyId },
    include: invitationInclude,
  });
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  const account = invitation.cpAccount;
  if (!account || !invitation.cpAccountId || !account.contractorPortalEnabled) {
    return failure("An enabled Contractor Portal account is required", 412, {
      code: "PORTAL_ACCOUNT_REQUIRED",
    });
  }

  if (invitation.status === "Activated") {
    const active = await prisma.contractorAssignment.findFirst({
      where: {
        companyId: user.companyId,
        projectId: invitation.projectId,
        contactId: invitation.contactId,
        role: invitation.role,
        status: "Active",
      },
      select: { id: true },
    });
    if (!active) return failure("Activated invitation has no active assignment", 409, { code: "ACTIVATION_INCOMPLETE" });

    const portalJobId = await prisma.cpJob.findFirst({
      where: {
        contractorId: account.id,
        projectId: invitation.projectId,
        awardedByCompanyId: user.companyId,
        status: "active",
      },
      select: { id: true },
    });
    if (!portalJobId) return failure("Activated invitation has no active portal job", 409, { code: "ACTIVATION_INCOMPLETE" });

    return NextResponse.json({
      ok: true,
      invitation: canonicalInvitation(invitation),
      assignmentId: active.id,
      portalJobId: portalJobId.id,
      activeAccessGranted: true,
    });
  }

  if (invitation.status !== "Accepted") {
    return failure(`Invitation must be Accepted before activation (current status: ${invitation.status})`, 409, {
      code: "INVITATION_NOT_ACCEPTED",
    });
  }
  if (!invitation.agreementAcceptedAt) {
    return failure("Agreement acceptance is required before activation", 412, {
      code: "AGREEMENT_REQUIRED",
    });
  }

  const compliance = await evaluateAssignmentCompliance(user.companyId, invitation.contactId);
  // Activation is always compliance-gated. The legacy warning-mode setting does
  // not make missing required documents safe for this irreversible transition.
  if (compliance.missingRequired.length > 0) {
    return failure("Activation blocked by compliance gate", 412, {
      code: "COMPLIANCE_REQUIRED",
      reasons: compliance.missingRequired,
    });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const [scopedContact, scopedProject] = await Promise.all([
          tx.contact.findFirst({ where: { id: invitation.contactId, companyId: user.companyId }, select: { id: true } }),
          tx.project.findFirst({ where: { id: invitation.projectId, companyId: user.companyId }, select: { id: true } }),
        ]);
        if (!scopedContact || !scopedProject) {
          throw new Error("ACTIVATION_SCOPE_INVALID");
        }

        const currentCompliance = await evaluateAssignmentCompliance(
          user.companyId,
          invitation.contactId,
          tx,
        );
        if (currentCompliance.missingRequired.length > 0) {
          throw new Error("COMPLIANCE_REQUIRED");
        }

        const cas = await tx.contractorProjectInvitation.updateMany({
          where: {
            id,
            companyId: user.companyId,
            status: "Accepted",
            agreementAcceptedAt: invitation.agreementAcceptedAt,
          },
          data: { status: "Activated" },
        });
        if (cas.count !== 1) {
          throw new Error("ACTIVATION_CAS_LOST");
        }

        const existingAssignment = await tx.contractorAssignment.findFirst({
          where: {
            projectId: invitation.projectId,
            contactId: invitation.contactId,
            role: invitation.role,
          },
          select: { id: true, companyId: true },
        });
        if (existingAssignment && existingAssignment.companyId !== user.companyId) {
          throw new Error("ACTIVATION_ASSIGNMENT_SCOPE_INVALID");
        }

        const assignment = await tx.contractorAssignment.upsert({
          where: {
            projectId_contactId_role: {
              projectId: invitation.projectId,
              contactId: invitation.contactId,
              role: invitation.role,
            },
          },
          create: {
            companyId: user.companyId,
            contactId: invitation.contactId,
            projectId: invitation.projectId,
            role: invitation.role,
            status: "Active",
            assignedBy: user.id,
          },
          update: { status: "Active", assignedBy: user.id },
          select: { id: true },
        });

        const portalJobId = await ensureContractorPortalJob(tx, {
          contractorId: account.id,
          companyId: user.companyId,
          projectId: invitation.project.id,
          projectName: invitation.project.name,
          projectCode: invitation.project.code,
          role: invitation.role,
          portalEnabled: account.contractorPortalEnabled,
        });
        if (!portalJobId) throw new Error("PORTAL_JOB_NOT_CREATED");

        const updatedInvitation = await tx.contractorProjectInvitation.update({
          where: { id },
          data: { documentGateState: "Complete", complianceGateState: "Complete" },
          include: invitationInclude,
        });
        await tx.activityLogEntry.create({
          data: {
            companyId: user.companyId,
            actorId: user.id,
            action: "contractor_project_invitation.activate",
            entity: "ContractorProjectInvitation",
            entityId: id,
            message: `Activated ${updatedInvitation.contact.name} for ${updatedInvitation.project.code} as ${updatedInvitation.role}`,
            meta: {
              projectId: updatedInvitation.projectId,
              contactId: updatedInvitation.contactId,
              role: updatedInvitation.role,
              assignmentId: assignment.id,
              contractorPortalJobId: portalJobId,
            },
          },
        });
        return { invitation: updatedInvitation, assignmentId: assignment.id, portalJobId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({
      ok: true,
      invitation: canonicalInvitation(result.invitation),
      assignmentId: result.assignmentId,
      portalJobId: result.portalJobId,
      activeAccessGranted: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVATION_CAS_LOST") {
      return failure("Invitation activation was already changed; retry", 409, { code: "ACTIVATION_CAS_LOST" });
    }
    if (error instanceof Error && error.message === "COMPLIANCE_REQUIRED") {
      return failure("Activation blocked by compliance gate", 412, { code: "COMPLIANCE_REQUIRED" });
    }
    if (error instanceof Error && (error.message === "ACTIVATION_SCOPE_INVALID" || error.message === "ACTIVATION_ASSIGNMENT_SCOPE_INVALID")) {
      return failure("Invitation references records outside the company scope", 409, { code: "ACTIVATION_SCOPE_INVALID" });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return failure("Invitation activation conflicted with another activation; retry", 409, { code: "ACTIVATION_CONFLICT" });
    }
    throw error;
  }
}
