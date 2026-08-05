import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type InvitationClient = Pick<PrismaClient, "$transaction" | "contractorProjectInvitation">;

export type InvitationOutcome =
  | "valid"
  | "invalid"
  | "expired"
  | "revoked"
  | "blocked"
  | "declined"
  | "accepted";

export type SafeInvitationSummary = {
  id: string;
  email: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  role: string;
  trade: string | null;
  agreementVersion: string;
  expiresAt: string;
};

export type InvitationInspection = {
  outcome: InvitationOutcome;
  summary?: SafeInvitationSummary;
};

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function effectiveExpiry(invitation: { expiresAt: Date; inviteTokenExpiresAt: Date | null }): Date {
  if (!invitation.inviteTokenExpiresAt) return invitation.expiresAt;
  return new Date(Math.min(invitation.expiresAt.getTime(), invitation.inviteTokenExpiresAt.getTime()));
}

function terminalOutcome(status: string): InvitationOutcome | null {
  if (status === "Accepted") return "accepted";
  if (status === "Revoked") return "revoked";
  if (status === "Blocked") return "blocked";
  if (status === "Declined") return "declined";
  return null;
}

function safeSummary(invitation: {
  id: string;
  emailSnapshot: string;
  role: string;
  trade: string | null;
  agreementVersion: string;
  expiresAt: Date;
  inviteTokenExpiresAt: Date | null;
  company: { name: string };
  project: { code: string; name: string };
}): SafeInvitationSummary {
  return {
    id: invitation.id,
    email: invitation.emailSnapshot,
    companyName: invitation.company.name,
    projectCode: invitation.project.code,
    projectName: invitation.project.name,
    role: invitation.role,
    trade: invitation.trade,
    agreementVersion: invitation.agreementVersion,
    expiresAt: effectiveExpiry(invitation).toISOString(),
  };
}

const invitationInclude = {
  company: { select: { name: true } },
  project: { select: { code: true, name: true } },
} as const;

export async function inspectInvitation(
  token: string,
  now = new Date(),
  client: InvitationClient = prisma,
): Promise<InvitationInspection> {
  const trimmed = token.trim();
  if (!trimmed) return { outcome: "invalid" };
  const invite = await client.contractorProjectInvitation.findUnique({
    where: { inviteTokenHash: hashInvitationToken(trimmed) },
    include: invitationInclude,
  });
  if (!invite) return { outcome: "invalid" };

  const terminal = terminalOutcome(invite.status);
  if (terminal) return { outcome: terminal, summary: safeSummary(invite) };
  if (effectiveExpiry(invite).getTime() < now.getTime()) {
    return { outcome: "expired", summary: safeSummary(invite) };
  }
  return { outcome: "valid", summary: safeSummary(invite) };
}

export type AcceptanceResult =
  | { ok: true; summary: SafeInvitationSummary }
  | { ok: false; outcome: Exclude<InvitationOutcome, "valid"> | "email_mismatch" | "agreement_required" };

export async function acceptInvitation({
  token,
  accountId,
  accountEmail,
  agreementAccepted,
  now = new Date(),
  client = prisma,
}: {
  token: string;
  accountId: string;
  accountEmail: string;
  agreementAccepted: boolean;
  now?: Date;
  client?: InvitationClient;
}): Promise<AcceptanceResult> {
  if (!agreementAccepted) return { ok: false, outcome: "agreement_required" };
  const inspection = await inspectInvitation(token, now, client);
  if (inspection.outcome !== "valid" || !inspection.summary) {
    const outcome: Exclude<InvitationOutcome, "valid"> = inspection.outcome === "valid" ? "invalid" : inspection.outcome;
    return { ok: false, outcome };
  }
  if (normalizedEmail(inspection.summary.email) !== normalizedEmail(accountEmail)) {
    return { ok: false, outcome: "email_mismatch" };
  }

  const tokenHash = hashInvitationToken(token.trim());
  const updated = await client.$transaction(async (tx) => {
    const result = await tx.contractorProjectInvitation.updateMany({
      where: {
        inviteTokenHash: tokenHash,
        status: "Pending",
        expiresAt: { gte: now },
        OR: [{ inviteTokenExpiresAt: null }, { inviteTokenExpiresAt: { gte: now } }],
      },
      data: {
        status: "Accepted",
        agreementAcceptedAt: now,
        acceptedById: accountId,
      },
    });
    return result.count;
  });
  if (updated === 1) return { ok: true, summary: inspection.summary };

  // A concurrent accept/revoke/expiry won the CAS. Re-read only to return a
  // clear state; no retry or unconditional write is allowed.
  const after = await inspectInvitation(token, now, client);
  const outcome: Exclude<InvitationOutcome, "valid"> = after.outcome === "valid" ? "invalid" : after.outcome;
  return { ok: false, outcome };
}

export function invitationOutcomeMessage(outcome: InvitationOutcome | "email_mismatch" | "agreement_required"): string {
  switch (outcome) {
    case "invalid": return "This invitation link is invalid or no longer available.";
    case "expired": return "This invitation has expired. Ask the project company to send a new invitation.";
    case "revoked": return "This invitation was revoked by the project company.";
    case "blocked": return "This invitation is blocked. Contact the project company for help.";
    case "declined": return "This invitation was declined and cannot be accepted.";
    case "accepted": return "This invitation has already been accepted. Sign in to continue.";
    case "email_mismatch": return "Sign in with the contractor account that matches the invited email address.";
    case "agreement_required": return "You must explicitly accept the agreement before continuing.";
    default: return "This invitation cannot be accepted.";
  }
}
