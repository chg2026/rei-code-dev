import { NextRequest, NextResponse } from "next/server";
import { ContactType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  classifyContractorPortalLink,
  CONTRACTOR_PORTAL_EMAIL_RE,
  isContractorContact,
  normalizePortalEmail,
} from "@/lib/contractorPortalContactLink";

export const dynamic = "force-dynamic";

const accountSelect = {
  id: true,
  email: true,
  contractorPortalEnabled: true,
  status: true,
} as const;

const contactSelect = {
  id: true,
  companyId: true,
  type: true,
  email: true,
  contractorPortalAccountId: true,
  contractorPortalLinkStatus: true,
  contractorPortalAccount: { select: accountSelect },
} as const;

type ContactPayload = {
  id: string;
  type: ContactType;
  email: string | null;
  contractorPortalAccountId: string | null;
  contractorPortalLinkStatus: string;
  contractorPortalAccount: { id: string; email: string; contractorPortalEnabled: boolean; status: string } | null;
};

function safeContact(contact: ContactPayload) {
  return {
    id: contact.id,
    type: contact.type,
    email: contact.email,
    contractorPortalAccountId: contact.contractorPortalAccountId,
    contractorPortalLinkStatus: contact.contractorPortalLinkStatus,
    account: contact.contractorPortalAccount
      ? {
          id: contact.contractorPortalAccount.id,
          email: contact.contractorPortalAccount.email,
          enabled: contact.contractorPortalAccount.contractorPortalEnabled,
          status: contact.contractorPortalAccount.status,
        }
      : null,
  };
}

async function resolveContact(id: string, companyId: string) {
  return prisma.contact.findFirst({
    where: { id, companyId },
    select: contactSelect,
  });
}

class ContactLinkFailure extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "contacts", "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const contact = await resolveContact(id, user.companyId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (!isContractorContact(contact.type)) {
    return NextResponse.json({ ...safeContact(contact), contractorPortalLinkStatus: "NotFound" });
  }

  const email = normalizePortalEmail(contact.email);
  const [account, onboardingInvite, projectInvite] = await Promise.all([
    email ? prisma.cpAccount.findUnique({ where: { email }, select: accountSelect }) : null,
    email
      ? prisma.cpOnboardingInvite.findFirst({
          where: { email, inviterCompanyId: user.companyId, consumedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        })
      : null,
    prisma.contractorProjectInvitation.findFirst({
      where: { companyId: user.companyId, contactId: contact.id, status: "Pending", expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);

  const status = classifyContractorPortalLink({
    linked: Boolean(contact.contractorPortalAccountId),
    account,
    invitePending: Boolean(onboardingInvite || projectInvite),
  });
  return NextResponse.json({
    ...safeContact({ ...contact, contractorPortalAccount: account }),
    contractorPortalLinkStatus: status,
  });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "contacts", "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await ctx.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // This is deliberately the source of truth for the mutation. The request-time
      // contact may have changed since the panel rendered or since a stale retry began.
      const current = await tx.contact.findFirst({
        where: { id, companyId: user.companyId },
        select: contactSelect,
      });
      if (!current) throw new ContactLinkFailure(404, "Contact not found");
      if (!isContractorContact(current.type)) {
        throw new ContactLinkFailure(400, "Contact must be a contractor or subcontractor");
      }

      const email = normalizePortalEmail(current.email);
      if (!CONTRACTOR_PORTAL_EMAIL_RE.test(email)) {
        throw new ContactLinkFailure(400, "Contractor contact must have a valid email");
      }

      const [account, onboardingInvite, projectInvite] = await Promise.all([
        tx.cpAccount.findUnique({ where: { email }, select: accountSelect }),
        tx.cpOnboardingInvite.findFirst({
          where: { email, inviterCompanyId: user.companyId, consumedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        }),
        tx.contractorProjectInvitation.findFirst({
          where: { companyId: user.companyId, contactId: current.id, status: "Pending", expiresAt: { gt: new Date() } },
          select: { id: true },
        }),
      ]);

      const status = account && account.contractorPortalEnabled && account.status !== "Suspended"
        ? "Linked"
        : classifyContractorPortalLink({
            linked: Boolean(current.contractorPortalAccountId),
            account,
            invitePending: Boolean(onboardingInvite || projectInvite),
          });
      const accountId = status === "Linked" ? account!.id : null;

      // CAS on every identity/state field used above. A concurrent email/type/link
      // change makes this count zero, so this request cannot overwrite newer state.
      const claimed = await tx.contact.updateMany({
        where: {
          id: current.id,
          companyId: user.companyId,
          type: current.type,
          email: current.email,
          contractorPortalAccountId: current.contractorPortalAccountId,
          contractorPortalLinkStatus: current.contractorPortalLinkStatus,
        },
        data: {
          contractorPortalAccountId: accountId,
          contractorPortalLinkStatus: status,
        },
      });
      if (claimed.count !== 1) {
        throw new ContactLinkFailure(409, "Contact changed while it was being linked; refresh and try again");
      }

      const update = await tx.contact.findFirst({
        where: { id: current.id, companyId: user.companyId },
        select: contactSelect,
      });
      if (!update) throw new ContactLinkFailure(409, "Contact changed while it was being linked; refresh and try again");

      await tx.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "contact.contractor_portal_link",
          entity: "Contact",
          entityId: current.id,
          message: `Contractor Portal link status set to ${status}`,
          meta: { contactId: current.id, status, cpAccountId: account?.id ?? null },
        },
      });
      return update;
    });

    return NextResponse.json({ ok: true, contact: safeContact(result) });
  } catch (error) {
    if (error instanceof ContactLinkFailure) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
