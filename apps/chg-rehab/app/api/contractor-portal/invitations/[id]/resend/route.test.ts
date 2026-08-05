import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/session";

const delivery = vi.hoisted(() => ({ send: vi.fn() }));
const tokenFactory = vi.hoisted(() => vi.fn());
const joinUrl = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  invitation: null as any,
  updates: [] as any[],
  company: { id: "co-1", name: "CHG Company" },
}));

vi.mock("@/lib/contractorProjectInvitationEmail", () => ({
  createContractorInviteToken: tokenFactory,
  buildContractorInviteJoinUrl: joinUrl,
  sendContractorProjectInvitationEmail: delivery.send,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ can: vi.fn() }));
vi.mock("@/lib/billing-gate", () => ({ billingBlockedResponse: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: async ({ where }: any) => db.company.id === where.id ? db.company : null },
    contractorProjectInvitation: {
      findFirst: async ({ where }: any) => db.invitation && db.invitation.id === where.id && db.invitation.companyId === where.companyId ? db.invitation : null,
      findUnique: async ({ where }: any) => db.invitation && db.invitation.id === where.id ? db.invitation : null,
      updateMany: async ({ where, data }: any) => {
        const matches = db.invitation && db.invitation.id === where.id && db.invitation.companyId === where.companyId && db.invitation.status === where.status && db.invitation.inviteTokenHash === where.inviteTokenHash && db.invitation.expiresAt > where.expiresAt.gt;
        if (!matches) return { count: 0 };
        Object.assign(db.invitation, data);
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        db.updates.push(data);
        db.invitation = { ...db.invitation, ...data };
        return db.invitation;
      },
    },
    $transaction: async (fn: any) => fn({ contractorProjectInvitation: {
      findUnique: async ({ where }: any) => db.invitation && db.invitation.id === where.id ? db.invitation : null,
      updateMany: async ({ where, data }: any) => {
        const matches = db.invitation && db.invitation.id === where.id && db.invitation.companyId === where.companyId && db.invitation.status === where.status && db.invitation.inviteTokenHash === where.inviteTokenHash && db.invitation.expiresAt > where.expiresAt.gt;
        if (!matches) return { count: 0 };
        db.updates.push(data);
        Object.assign(db.invitation, data);
        return { count: 1 };
      },
    } }),
  },
}));

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

const auth = vi.mocked(getCurrentUser);
const permission = vi.mocked(can);
const billing = vi.mocked(billingBlockedResponse);

const user = (companyId = "co-1"): SessionUser => ({
  id: "u-1",
  companyId,
  role: "Admin",
  email: "admin@example.com",
  firstName: "A",
  lastName: "U",
});

const pendingInvitation = () => ({
  id: "inv-1",
  companyId: "co-1",
  status: "Pending",
  emailSnapshot: "build@example.com",
  role: "GC",
  roleKey: "gc",
  trade: "GC",
  agreementVersion: "v1",
  invitedAt: new Date("2030-01-01T00:00:00Z"),
  expiresAt: new Date("2030-02-01T00:00:00Z"),
  inviteTokenHash: "old-hash",
  inviteDeliveryStatus: "Failed",
  inviteSentAt: null,
  inviteDeliveryMessageId: null,
  inviteDeliveryError: "previous failure",
  contact: { id: "c-1", name: "Build Co", email: "build@example.com", type: "Contractor" },
  project: { id: "p-1", code: "CHG-1", name: "Project One" },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.invitation = pendingInvitation();
  db.updates = [];
  auth.mockResolvedValue(user());
  permission.mockResolvedValue(true);
  billing.mockResolvedValue(null);
  tokenFactory.mockReturnValue({ rawToken: "new-raw-token", tokenHash: "new-hash" });
  joinUrl.mockReturnValue("https://contractor.doorine.com/accept-invite?token=new-raw-token");
  delivery.send.mockResolvedValue({ delivered: true, messageId: "msg-2" });
});

describe("resend contractor project invitation", () => {
  it("rejects an invitation from another company without rotating or sending", async () => {
    db.invitation = { ...pendingInvitation(), companyId: "co-2" };
    const response = await POST(new Request("http://test"), { params: Promise.resolve({ id: "inv-1" }) });
    expect(response.status).toBe(404);
    expect(tokenFactory).not.toHaveBeenCalled();
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it("rotates the token and records successful delivery", async () => {
    const response = await POST(new Request("http://test"), { params: Promise.resolve({ id: "inv-1" }) });
    expect(response.status).toBe(200);
    expect(db.updates[0]).toMatchObject({ inviteTokenHash: "new-hash", inviteDeliveryStatus: "Pending" });
    expect(db.updates[1]).toMatchObject({ inviteDeliveryStatus: "Delivered", inviteDeliveryMessageId: "msg-2" });
    expect(delivery.send).toHaveBeenCalledWith(expect.objectContaining({ joinUrl: "https://contractor.doorine.com/accept-invite?token=new-raw-token" }));
  });

  it("records delivery failure without claiming success", async () => {
    delivery.send.mockResolvedValue({ delivered: false, reason: "resend_not_configured" });
    const response = await POST(new Request("http://test"), { params: Promise.resolve({ id: "inv-1" }) });
    expect(response.status).toBe(200);
    expect(db.updates[1]).toMatchObject({ inviteDeliveryStatus: "Failed", inviteSentAt: null, inviteDeliveryError: "resend_not_configured" });
  });
});
