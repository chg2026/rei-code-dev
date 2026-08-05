import type { ContactType } from "@prisma/client";

export const CONTRACTOR_CONTACT_TYPES: ContactType[] = ["Contractor", "Subcontractor"];
export const CONTRACTOR_PORTAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContractorPortalLinkStatus =
  | "Linked"
  | "AccountFound"
  | "NotFound"
  | "Disabled"
  | "InvitePending";

export function normalizePortalEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isContractorContact(type: ContactType): boolean {
  return CONTRACTOR_CONTACT_TYPES.includes(type);
}

export function classifyContractorPortalLink(input: {
  linked: boolean;
  account: { contractorPortalEnabled: boolean; status: string } | null;
  invitePending: boolean;
}): ContractorPortalLinkStatus {
  if (input.account && input.linked && input.account.contractorPortalEnabled && input.account.status !== "Suspended") {
    return "Linked";
  }
  if (input.account && (!input.account.contractorPortalEnabled || input.account.status === "Suspended")) {
    return "Disabled";
  }
  if (input.account) return "AccountFound";
  if (input.invitePending) return "InvitePending";
  return "NotFound";
}
