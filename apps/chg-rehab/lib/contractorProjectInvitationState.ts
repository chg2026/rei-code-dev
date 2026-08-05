export enum ContractorProjectInvitationStatus {
  Pending = "Pending",
  Accepted = "Accepted",
  Activated = "Activated",
  Declined = "Declined",
  Expired = "Expired",
  Revoked = "Revoked",
  Blocked = "Blocked",
}

export type ContractorProjectInvitationRecord = {
  status: ContractorProjectInvitationStatus;
  [key: string]: unknown;
};

export type CreateContractorProjectInvitationInput = {
  companyId: string;
  projectId: string;
  contactId: string;
  cpAccountId?: string | null;
  emailSnapshot: string;
  role: string;
  trade?: string | null;
  invitedById: string;
  invitedAt: Date;
  expiresAt: Date;
  agreementVersion: string;
};

const ALLOWED_TRANSITIONS: Record<ContractorProjectInvitationStatus, ReadonlySet<ContractorProjectInvitationStatus>> = {
  [ContractorProjectInvitationStatus.Pending]: new Set([
    ContractorProjectInvitationStatus.Accepted,
    ContractorProjectInvitationStatus.Declined,
    ContractorProjectInvitationStatus.Expired,
    ContractorProjectInvitationStatus.Revoked,
    ContractorProjectInvitationStatus.Blocked,
  ]),
  [ContractorProjectInvitationStatus.Blocked]: new Set([
    ContractorProjectInvitationStatus.Pending,
    ContractorProjectInvitationStatus.Revoked,
  ]),
  [ContractorProjectInvitationStatus.Accepted]: new Set([
    ContractorProjectInvitationStatus.Activated,
  ]),
  [ContractorProjectInvitationStatus.Activated]: new Set(),
  [ContractorProjectInvitationStatus.Declined]: new Set(),
  [ContractorProjectInvitationStatus.Expired]: new Set(),
  [ContractorProjectInvitationStatus.Revoked]: new Set(),
};

export function contractorProjectInvitationDuplicateKey(input: {
  companyId: string;
  projectId: string;
  contactId: string;
  role: string;
}): string {
  return [input.companyId, input.projectId, input.contactId, input.role.trim().toLowerCase()].join(":");
}

export function contractorProjectInvitationRoleKey(role: string): string {
  return role.trim().toLowerCase();
}

export function createContractorProjectInvitation(
  input: CreateContractorProjectInvitationInput,
) {
  const emailSnapshot = input.emailSnapshot.trim().toLowerCase();
  const role = input.role.trim();
  const roleKey = contractorProjectInvitationRoleKey(role);
  return {
    ...input,
    emailSnapshot,
    role,
    roleKey,
    status: ContractorProjectInvitationStatus.Pending,
    duplicateKey: contractorProjectInvitationDuplicateKey(input),
  };
}

export function isContractorProjectInvitationDuplicate(
  existing: { companyId: string; projectId: string; contactId: string; role: string },
  candidate: { companyId: string; projectId: string; contactId: string; role: string },
): boolean {
  return contractorProjectInvitationDuplicateKey(existing) === contractorProjectInvitationDuplicateKey(candidate);
}

export function transitionContractorProjectInvitation<T extends ContractorProjectInvitationRecord>(
  invitation: T,
  nextStatus: ContractorProjectInvitationStatus,
): T {
  if (!ALLOWED_TRANSITIONS[invitation.status].has(nextStatus)) {
    throw new Error(
      `Invalid contractor project invitation transition: ${invitation.status} -> ${nextStatus}`,
    );
  }
  return { ...invitation, status: nextStatus };
}
