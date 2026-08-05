import { describe, expect, it } from "vitest";
import { invitationIsActivatable, invitationIsResendable } from "@/components/rehab/ContractorOnboarding";

describe("contractor onboarding invitation actions", () => {
  it("allows resend only for a non-expired pending invitation", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(invitationIsResendable({ status: "Pending", expiresAt: future })).toBe(true);
    expect(invitationIsResendable({ status: "Accepted", expiresAt: future })).toBe(false);
    expect(invitationIsResendable({ status: "Pending", expiresAt: new Date(Date.now() - 1).toISOString() })).toBe(false);
  });

  it("allows activation only for accepted invitations", () => {
    expect(invitationIsActivatable({ status: "Accepted" })).toBe(true);
    for (const status of ["Pending", "Declined", "Expired", "Revoked", "Blocked", "Activated"]) {
      expect(invitationIsActivatable({ status })).toBe(false);
    }
  });
});
