import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invitation: null as any,
  casCount: 1,
  writes: 0,
  activities: [] as any[],
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ can: vi.fn() }));
vi.mock("@/lib/billing-gate", () => ({ billingBlockedResponse: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const relations = (row: any) => ({
    ...row,
    contact: { id: row.contactId, name: "Build Co", email: row.emailSnapshot, type: "Contractor" },
    project: { id: row.projectId, code: "P-1", name: "Project One" },
  });
  const invitations = {
    findFirst: vi.fn(async ({ where }: any) => state.invitation && state.invitation.id === where.id && state.invitation.companyId === where.companyId ? relations(state.invitation) : null),
    updateMany: vi.fn(async ({ data }: any) => {
      state.writes++;
      if (state.casCount === 1) Object.assign(state.invitation, data);
      return { count: state.casCount };
    }),
    findUnique: vi.fn(async () => state.invitation ? relations(state.invitation) : null),
  };
  const tx = { contractorProjectInvitation: invitations, activityLogEntry: { create: vi.fn(async ({ data }: any) => { state.activities.push(data); }) } };
  return { prisma: { contractorProjectInvitation: invitations, $transaction: vi.fn(async (fn: any) => fn(tx)) } };
});

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

const auth = vi.mocked(getCurrentUser);
const permission = vi.mocked(can);
const billing = vi.mocked(billingBlockedResponse);
const ctx = { params: Promise.resolve({ id: "inv-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  state.invitation = { id: "inv-1", companyId: "co-1", projectId: "p-1", contactId: "c-1", status: "Pending", expiresAt: new Date(Date.now() + 60_000), inviteTokenHash: "hash", emailSnapshot: "build@example.com" };
  state.casCount = 1; state.writes = 0; state.activities = [];
  auth.mockResolvedValue({ id: "u-1", companyId: "co-1", role: "Admin", email: "a@example.com" } as any);
  permission.mockResolvedValue(true); billing.mockResolvedValue(null);
});

describe("POST /api/contractor-portal/invitations/[id]/revoke", () => {
  it("requires authentication, edit permission, and billing", async () => {
    auth.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://test"), ctx)).status).toBe(401);
    auth.mockResolvedValue({ id: "u-1", companyId: "co-1" } as any); permission.mockResolvedValueOnce(false);
    expect((await POST(new Request("http://test"), ctx)).status).toBe(403);
    permission.mockResolvedValue(true); billing.mockResolvedValueOnce(new Response("blocked", { status: 402 }));
    expect((await POST(new Request("http://test"), ctx)).status).toBe(402);
  });

  it("does not disclose or mutate a cross-company invitation", async () => {
    state.invitation.companyId = "co-2";
    const response = await POST(new Request("http://test"), ctx);
    expect(response.status).toBe(404); expect(state.writes).toBe(0); expect(state.activities).toHaveLength(0);
  });

  it("rejects expired and non-pending invitations without writes", async () => {
    state.invitation.expiresAt = new Date(Date.now() - 1);
    expect((await POST(new Request("http://test"), ctx)).status).toBe(409);
    state.invitation.expiresAt = new Date(Date.now() + 60_000); state.invitation.status = "Accepted";
    expect((await POST(new Request("http://test"), ctx)).status).toBe(409);
    expect(state.writes).toBe(0);
  });

  it("uses a pending/unexpired/hash CAS and records one audit entry", async () => {
    const response = await POST(new Request("http://test"), ctx);
    expect(response.status).toBe(200);
    expect(state.invitation).toMatchObject({ status: "Revoked", revokedById: "u-1", inviteTokenHash: null, inviteTokenExpiresAt: null });
    expect(state.invitation.revokedAt).toBeInstanceOf(Date);
    expect(state.activities).toHaveLength(1); expect(state.activities[0]).toMatchObject({ action: "contractor_project_invitation.revoke", entityId: "inv-1" });
  });

  it("returns conflict when the revoke CAS is lost", async () => {
    state.casCount = 0;
    const response = await POST(new Request("http://test"), ctx);
    expect(response.status).toBe(409); expect(state.writes).toBe(1); expect(state.activities).toHaveLength(0);
  });
});
