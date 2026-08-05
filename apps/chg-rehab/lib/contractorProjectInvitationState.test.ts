import { describe, expect, it } from "vitest";
import {
  ContractorProjectInvitationStatus,
  contractorProjectInvitationDuplicateKey,
  contractorProjectInvitationRoleKey,
  createContractorProjectInvitation,
  isContractorProjectInvitationDuplicate,
  transitionContractorProjectInvitation,
} from "./contractorProjectInvitationState";

describe("contractor project invitation state machine", () => {
  it("creates a pending invitation with a stable duplicate key", () => {
    const invitation = createContractorProjectInvitation({
      companyId: "company-1",
      projectId: "project-1",
      contactId: "contact-1",
      emailSnapshot: "GC@example.com",
      role: "General Contractor",
      trade: "GeneralContractor",
      invitedById: "user-1",
      invitedAt: new Date("2026-08-01T12:00:00.000Z"),
      expiresAt: new Date("2026-08-15T12:00:00.000Z"),
      agreementVersion: "v1",
    });

    expect(invitation.status).toBe(ContractorProjectInvitationStatus.Pending);
    expect(invitation.duplicateKey).toBe("company-1:project-1:contact-1:general contractor");
    expect(invitation.emailSnapshot).toBe("gc@example.com");
    expect(invitation.roleKey).toBe("general contractor");
  });

  it.each([
    [ContractorProjectInvitationStatus.Pending, ContractorProjectInvitationStatus.Accepted],
    [ContractorProjectInvitationStatus.Pending, ContractorProjectInvitationStatus.Declined],
    [ContractorProjectInvitationStatus.Pending, ContractorProjectInvitationStatus.Expired],
    [ContractorProjectInvitationStatus.Pending, ContractorProjectInvitationStatus.Revoked],
    [ContractorProjectInvitationStatus.Pending, ContractorProjectInvitationStatus.Blocked],
    [ContractorProjectInvitationStatus.Blocked, ContractorProjectInvitationStatus.Pending],
  ])("allows %s -> %s", (from, to) => {
    expect(transitionContractorProjectInvitation({ status: from }, to).status).toBe(to);
  });

  it("rejects terminal or backwards transitions that could activate an invitation twice", () => {
    expect(() =>
      transitionContractorProjectInvitation(
        { status: ContractorProjectInvitationStatus.Accepted },
        ContractorProjectInvitationStatus.Pending,
      ),
    ).toThrow(/Invalid contractor project invitation transition/);
    expect(() =>
      transitionContractorProjectInvitation(
        { status: ContractorProjectInvitationStatus.Declined },
        ContractorProjectInvitationStatus.Accepted,
      ),
    ).toThrow(/Invalid contractor project invitation transition/);
  });

  it("treats an existing same-company project/contact/role invitation as an idempotent duplicate", () => {
    const existing = createContractorProjectInvitation({
      companyId: "company-1",
      projectId: "project-1",
      contactId: "contact-1",
      emailSnapshot: "old@example.com",
      role: "General Contractor",
      trade: null,
      invitedById: "user-1",
      invitedAt: new Date("2026-08-01T12:00:00.000Z"),
      expiresAt: new Date("2026-08-15T12:00:00.000Z"),
      agreementVersion: "v1",
    });
    const duplicate = createContractorProjectInvitation({
      companyId: "company-1",
      projectId: "project-1",
      contactId: "contact-1",
      emailSnapshot: "new@example.com",
      role: "General Contractor",
      trade: null,
      invitedById: "user-2",
      invitedAt: new Date("2026-08-02T12:00:00.000Z"),
      expiresAt: new Date("2026-08-16T12:00:00.000Z"),
      agreementVersion: "v2",
    });

    expect(isContractorProjectInvitationDuplicate(existing, duplicate)).toBe(true);
    expect(duplicate.duplicateKey).toBe(existing.duplicateKey);
    expect(contractorProjectInvitationDuplicateKey(duplicate)).toBe(
      "company-1:project-1:contact-1:general contractor",
    );
    expect(contractorProjectInvitationRoleKey("  General Contractor ")).toBe("general contractor");
  });
});
