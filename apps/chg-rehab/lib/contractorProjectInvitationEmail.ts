import { createHash, randomBytes } from "node:crypto";
import { sendInviteEmail, type SendResult } from "@/lib/email";

export const DEFAULT_CONTRACTOR_PORTAL_URL = "https://contractor.doorine.com";

export function createContractorInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex");
  return { rawToken, tokenHash: createHash("sha256").update(rawToken, "utf8").digest("hex") };
}

export function buildContractorInviteJoinUrl(rawToken: string): string {
  const base = process.env.CONTRACTOR_PORTAL_URL?.trim() || DEFAULT_CONTRACTOR_PORTAL_URL;
  const url = new URL("/accept-invite", base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export type ContractorProjectInvitationEmail = {
  to: string;
  inviterName: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  role: string;
  joinUrl: string;
  expiresAt: Date;
};

export function sendContractorProjectInvitationEmail(
  msg: ContractorProjectInvitationEmail,
): Promise<SendResult> {
  return sendInviteEmail(msg);
}
