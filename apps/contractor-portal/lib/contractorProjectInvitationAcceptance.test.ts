import { describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  hashInvitationToken,
  inspectInvitation,
} from "./contractorProjectInvitationAcceptance";

const now = new Date("2026-08-05T12:00:00.000Z");
const token = "raw-invite-token-123";
const base = {
  id: "inv-1",
  emailSnapshot: "contractor@example.com",
  role: "Drywall subcontractor",
  trade: "Drywall",
  agreementVersion: "v1",
  status: "Pending",
  expiresAt: new Date("2026-08-12T12:00:00.000Z"),
  inviteTokenExpiresAt: new Date("2026-08-10T12:00:00.000Z"),
  company: { name: "Acme Homes" },
  project: { code: "CHG-1", name: "Main Street Rehab" },
};

function clientFor(invitation: typeof base | null, count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  const client = {
    contractorProjectInvitation: { findUnique: vi.fn().mockResolvedValue(invitation), updateMany },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ contractorProjectInvitation: { updateMany } })),
  };
  return { client, updateMany };
}

describe("contractor project invitation acceptance", () => {
  it("hashes tokens for lookup and never returns the hash", async () => {
    const { client } = clientFor(base);
    const result = await inspectInvitation(token, now, client as never);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(client.contractorProjectInvitation.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { inviteTokenHash: hashInvitationToken(token) } }));
    expect(result).toMatchObject({ outcome: "valid", summary: { projectCode: "CHG-1", companyName: "Acme Homes" } });
    expect(JSON.stringify(result)).not.toContain(hashInvitationToken(token));
  });

  it.each([
    ["expired", { ...base, expiresAt: new Date("2026-08-04T12:00:00.000Z") }],
    ["revoked", { ...base, status: "Revoked" }],
    ["blocked", { ...base, status: "Blocked" }],
    ["declined", { ...base, status: "Declined" }],
    ["accepted", { ...base, status: "Accepted" }],
  ])("returns the clear %s outcome", async (outcome, invitation) => {
    const { client } = clientFor(invitation);
    await expect(inspectInvitation(token, now, client as never)).resolves.toMatchObject({ outcome });
  });

  it("returns invalid when the hash lookup misses", async () => {
    const { client } = clientFor(null);
    await expect(inspectInvitation("wrong-token", now, client as never)).resolves.toEqual({ outcome: "invalid" });
  });

  it("rejects an invited-email mismatch without CAS", async () => {
    const { client, updateMany } = clientFor(base);
    await expect(acceptInvitation({ token, accountId: "cp-1", accountEmail: "other@example.com", agreementAccepted: true, now, client: client as never })).resolves.toMatchObject({ ok: false, outcome: "email_mismatch" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("requires explicit agreement", async () => {
    const { client, updateMany } = clientFor(base);
    await expect(acceptInvitation({ token, accountId: "cp-1", accountEmail: base.emailSnapshot, agreementAccepted: false, now, client: client as never })).resolves.toMatchObject({ ok: false, outcome: "agreement_required" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("accepts with a token-and-expiry CAS and records the actor", async () => {
    const { client, updateMany } = clientFor(base);
    await expect(acceptInvitation({ token, accountId: "cp-1", accountEmail: base.emailSnapshot, agreementAccepted: true, now, client: client as never })).resolves.toMatchObject({ ok: true, summary: { id: "inv-1" } });
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ inviteTokenHash: hashInvitationToken(token), status: "Pending", expiresAt: { gte: now }, OR: expect.any(Array) }),
      data: { status: "Accepted", agreementAcceptedAt: now, acceptedById: "cp-1" },
    });
    expect(client).not.toHaveProperty("cpJob");
    expect(client).not.toHaveProperty("cpOperatorEdge");
  });

  it("reports a lost CAS without creating active records", async () => {
    const { client } = clientFor(base, 0);
    await expect(acceptInvitation({ token, accountId: "cp-1", accountEmail: base.emailSnapshot, agreementAccepted: true, now, client: client as never })).resolves.toMatchObject({ ok: false });
    expect(client).not.toHaveProperty("cpJob");
    expect(client).not.toHaveProperty("contractorAssignment");
    expect(client).not.toHaveProperty("cpOperatorEdge");
  });
});
