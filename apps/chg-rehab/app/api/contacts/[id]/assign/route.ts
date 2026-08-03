import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ContactType, Prisma } from "@prisma/client";
import { evaluateAssignmentCompliance } from "@/lib/assignmentGate";
import { ensureContractorPortalJob } from "@/lib/contractorPortalBridge";
import { billingBlockedResponse } from "@/lib/billing-gate";

/**
 * Assign a contractor (Contact) to a project. Honours the Compliance panel
 * toggles (W-9 / COI / Trade-license required + blockAssignmentIfDocsMissing)
 * via evaluateAssignmentCompliance:
 *   - blocking ON  + missing reqs → 412 reject
 *   - blocking OFF + missing reqs → allow but return `warnings` and log them
 *
 * Persists the assignment to the ContractorAssignment table used by the rehab
 * roster.
 *
 * Body accepts either `projectId` (preferred) or `projectCode`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(user, "contacts", "assign"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id: contactId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    projectCode?: string;
    role?: string;
  };
  const projectCode = (body.projectCode || "").trim();
  const projectId = (body.projectId || "").trim();
  if (!projectCode && !projectId) {
    return NextResponse.json(
      { error: "projectId or projectCode required" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: user.companyId },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  if (contact.type !== ContactType.Contractor && contact.type !== ContactType.Subcontractor) {
    return NextResponse.json(
      { error: `Cannot assign contact of type ${contact.type} to a project` },
      { status: 400 }
    );
  }

  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, companyId: user.companyId },
      })
    : await prisma.project.findFirst({
        where: { companyId: user.companyId, code: projectCode },
      });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${projectCode || projectId} not found` },
      { status: 404 }
    );
  }

  const gateState = await evaluateAssignmentCompliance(user.companyId, contact.id);

  // Reject only when blocking is enabled AND requirements are missing.
  if (!gateState.allowed) {
    return NextResponse.json(
      {
        error:
          "Assignment blocked by compliance gate: " +
          gateState.missingRequired.join("; "),
        reasons: gateState.missingRequired,
        code: "BLOCK_ASSIGNMENT_DOCS_MISSING",
      },
      { status: 412 }
    );
  }

  const warnings =
    !gateState.blockingEnabled && gateState.warnings.length > 0
      ? gateState.warnings
      : [];
  const warningMessages = warnings.map((w) => w.message);

  const role = (body.role || contact.trade || "Contractor").trim();

  try {
    const portalEmail = contact.email?.trim().toLowerCase() || "";
    const portalAccount = portalEmail
      ? await prisma.cpAccount.findUnique({ where: { email: portalEmail } })
      : null;

    const result = await prisma.$transaction(async (tx) => {
      await tx.contractorAssignment.create({
        data: {
          companyId: user.companyId,
          contactId: contact.id,
          projectId: project.id,
          role,
          status: "Active",
          assignedBy: user.id,
        },
      });

      let portalJobId: string | null = null;
      if (portalAccount) {
        portalJobId = await ensureContractorPortalJob(tx, {
          contractorId: portalAccount.id,
          companyId: user.companyId,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          role,
          portalEnabled: portalAccount.contractorPortalEnabled,
        });
      }

      await tx.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "contact.assign",
          entity: "Project",
          entityId: project.id,
          message:
            `Assigned ${contact.name} to ${project.code} as ${role}` +
            (portalJobId ? " and linked Contractor Portal job" : "") +
            (warningMessages.length
              ? ` (compliance warnings: ${warningMessages.join(", ")})`
              : ""),
          meta: {
            contactId: contact.id,
            projectCode: project.code,
            role,
            ...(portalJobId ? { contractorPortalJobId: portalJobId } : {}),
            ...(warningMessages.length
              ? { complianceWarnings: warningMessages }
              : {}),
          },
        },
      });

      return portalJobId;
    });

    return NextResponse.json({
      ok: true,
      warnings,
      contractorPortal: result
        ? { linked: true, jobId: result }
        : { linked: false, reason: "No enabled Contractor Portal account matched this contact email." },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `${contact.name} is already assigned to ${project.code} as ${role}` },
        { status: 409 }
      );
    }
    throw e;
  }
}
