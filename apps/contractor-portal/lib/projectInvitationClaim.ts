import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export type ClaimClient = Pick<PrismaClient, "contractorProjectInvitation">;

type ClaimInput = {
  projectToken: string;
  accountId: string;
  accountEmail: string;
  now?: Date;
  client?: ClaimClient;
};

export type ClaimResult =
  | { ok: true; invitationId: string }
  | { ok: false; outcome: "invalid" | "expired" | "not_pending" | "email_mismatch" | "already_claimed" | "conflict" };

export function hashProjectInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Link a pending project invitation to the authenticated CpAccount only.
 * This deliberately does not create jobs, assignments, operator edges, or access.
 */
export async function claimProjectInvitation({ projectToken, accountId, accountEmail, now = new Date(), client = prisma }: ClaimInput): Promise<ClaimResult> {
  if (!projectToken.trim() || !accountId.trim() || !accountEmail.trim()) return { ok: false, outcome: "invalid" };
  const hash = hashProjectInvitationToken(projectToken);
  const invitation = await client.contractorProjectInvitation.findUnique({ where: { inviteTokenHash: hash } });
  if (!invitation) return { ok: false, outcome: "invalid" };
  if (invitation.status !== "Pending") return { ok: false, outcome: "not_pending" };
  if (invitation.expiresAt < now || (invitation.inviteTokenExpiresAt && invitation.inviteTokenExpiresAt < now)) return { ok: false, outcome: "expired" };
  if (normalizeEmail(invitation.emailSnapshot) !== normalizeEmail(accountEmail)) return { ok: false, outcome: "email_mismatch" };
  if (invitation.cpAccountId) return invitation.cpAccountId === accountId
    ? { ok: true, invitationId: invitation.id }
    : { ok: false, outcome: "already_claimed" };

  const result = await client.contractorProjectInvitation.updateMany({
    where: {
      id: invitation.id,
      inviteTokenHash: hash,
      status: "Pending",
      cpAccountId: null,
      expiresAt: { gte: now },
      OR: [{ inviteTokenExpiresAt: null }, { inviteTokenExpiresAt: { gte: now } }],
    },
    data: { cpAccountId: accountId },
  });
  return result.count === 1 ? { ok: true, invitationId: invitation.id } : { ok: false, outcome: "conflict" };
}
