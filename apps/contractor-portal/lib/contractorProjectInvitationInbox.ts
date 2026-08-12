import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type InvitationClient = Pick<PrismaClient, "$transaction" | "contractorProjectInvitation">;
type Row = {
  id: string; companyId: string; projectId: string; contactId: string; cpAccountId: string | null; emailSnapshot: string;
  role: string; trade: string | null; status: string; expiresAt: Date; agreementVersion: string;
  company: { name: string; id: string }; project: { code: string; name: string; companyId: string };
  contact: { companyId: string };
};

export type InboxInvitation = Omit<Row, "expiresAt" | "contact"> & { expiresAt: string };
const include = {
  company: { select: { id: true, name: true } },
  project: { select: { code: true, name: true, companyId: true } },
  contact: { select: { companyId: true } },
} as const;
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const isTenantConsistent = (row: Pick<Row, "companyId" | "project" | "contact">) =>
  row.companyId === row.project.companyId && row.companyId === row.contact.companyId;
const safe = (row: Row): InboxInvitation => ({ ...row, expiresAt: row.expiresAt.toISOString() });

export async function listPendingInvitations(accountId: string, accountEmail: string, now = new Date(), client: InvitationClient = prisma): Promise<InboxInvitation[]> {
  const rows = await client.contractorProjectInvitation.findMany({
    where: { status: "Pending", expiresAt: { gte: now }, OR: [{ cpAccountId: accountId }, { cpAccountId: null, emailSnapshot: { equals: normalizeEmail(accountEmail), mode: "insensitive" } }] },
    include, orderBy: { invitedAt: "desc" },
  });
  return rows.filter((row) => isTenantConsistent(row as unknown as Row)).map((row) => safe(row as unknown as Row));
}

type MutationArgs = { invitationId: string; accountId: string; accountEmail: string; now?: Date; client?: InvitationClient };
function ownershipWhere(accountId: string, accountEmail: string) {
  return { OR: [{ cpAccountId: accountId }, { cpAccountId: null, emailSnapshot: { equals: normalizeEmail(accountEmail), mode: "insensitive" as const } }] };
}
function tenantWhere(row: Row) {
  return { companyId: row.companyId, project: { companyId: row.companyId }, contact: { companyId: row.companyId } };
}
async function assertOwned(invitationId: string, accountId: string, accountEmail: string, client: InvitationClient) {
  const row = await client.contractorProjectInvitation.findUnique({ where: { id: invitationId }, include });
  if (!row || !isTenantConsistent(row as unknown as Row)) return false;
  // Once linked, the account id is authoritative; email is only a fallback for unlinked rows.
  if (row.cpAccountId !== null ? row.cpAccountId !== accountId : normalizeEmail(row.emailSnapshot) !== normalizeEmail(accountEmail)) return false;
  return row;
}

export async function acceptInvitationForAccount({ invitationId, accountId, accountEmail, agreementAccepted, now = new Date(), client = prisma }: MutationArgs & { agreementAccepted: boolean }) {
  if (!agreementAccepted) return { ok: false as const, outcome: "agreement_required" as const };
  const row = await assertOwned(invitationId, accountId, accountEmail, client);
  if (!row) return { ok: false as const, outcome: "not_found" as const };
  if (row.status !== "Pending" || row.expiresAt < now) return { ok: false as const, outcome: "not_pending" as const };
  const count = await client.$transaction(async (tx) => (await tx.contractorProjectInvitation.updateMany({ where: { id: invitationId, status: "Pending", expiresAt: { gte: now }, ...tenantWhere(row as unknown as Row), ...ownershipWhere(accountId, accountEmail) }, data: { status: "Accepted", agreementAcceptedAt: now, acceptedById: accountId } })).count);
  return count === 1 ? { ok: true as const } : { ok: false as const, outcome: "conflict" as const };
}

export async function declineInvitation({ invitationId, accountId, accountEmail, now = new Date(), client = prisma }: MutationArgs) {
  const row = await assertOwned(invitationId, accountId, accountEmail, client);
  if (!row) return { ok: false as const, outcome: "not_found" as const };
  if (row.status !== "Pending" || row.expiresAt < now) return { ok: false as const, outcome: "not_pending" as const };
  const count = await client.$transaction(async (tx) => (await tx.contractorProjectInvitation.updateMany({ where: { id: invitationId, status: "Pending", expiresAt: { gte: now }, ...tenantWhere(row as unknown as Row), ...ownershipWhere(accountId, accountEmail) }, data: { status: "Declined", declinedAt: now, declinedById: accountId } })).count);
  return count === 1 ? { ok: true as const } : { ok: false as const, outcome: "conflict" as const };
}
