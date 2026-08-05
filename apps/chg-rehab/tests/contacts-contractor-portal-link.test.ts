// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  can,
  billingBlockedResponse,
  contactFindFirst,
  txContactFindFirst,
  transaction,
  cpAccountFindUnique,
  onboardingFindFirst,
  projectInviteFindFirst,
  contactUpdateMany,
  activityCreate,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  can: vi.fn(),
  billingBlockedResponse: vi.fn(),
  contactFindFirst: vi.fn(),
  txContactFindFirst: vi.fn(),
  transaction: vi.fn(),
  cpAccountFindUnique: vi.fn(),
  onboardingFindFirst: vi.fn(),
  projectInviteFindFirst: vi.fn(),
  contactUpdateMany: vi.fn(),
  activityCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/permissions", () => ({ can }));
vi.mock("@/lib/billing-gate", () => ({ billingBlockedResponse }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findFirst: (...a: unknown[]) => contactFindFirst(...a) },
    cpAccount: { findUnique: (...a: unknown[]) => cpAccountFindUnique(...a) },
    cpOnboardingInvite: { findFirst: (...a: unknown[]) => onboardingFindFirst(...a) },
    contractorProjectInvitation: { findFirst: (...a: unknown[]) => projectInviteFindFirst(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

import { POST } from "@/app/api/contacts/[id]/contractor-portal/route";
import { classifyContractorPortalLink, normalizePortalEmail } from "@/lib/contractorPortalContactLink";

const user = { id: "u1", companyId: "co1", role: "Admin", email: "admin@example.com" };
const ctx = { params: Promise.resolve({ id: "contact-1" }) };
const request = new Request("http://localhost/api/contacts/contact-1/contractor-portal", { method: "POST" });

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1", companyId: "co1", type: "Contractor", email: " Contractor@Example.com ",
    contractorPortalAccountId: null, contractorPortalLinkStatus: "NotFound", contractorPortalAccount: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue(user);
  can.mockResolvedValue(true);
  billingBlockedResponse.mockResolvedValue(null);
  contactFindFirst.mockResolvedValue(contact());
  txContactFindFirst.mockResolvedValue(contact());
  cpAccountFindUnique.mockResolvedValue(null);
  onboardingFindFirst.mockResolvedValue(null);
  projectInviteFindFirst.mockResolvedValue(null);
  contactUpdateMany.mockResolvedValue({ count: 1 });
  activityCreate.mockResolvedValue({});
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    contact: {
      findFirst: txContactFindFirst,
      updateMany: contactUpdateMany,
    },
    cpAccount: { findUnique: cpAccountFindUnique },
    cpOnboardingInvite: { findFirst: onboardingFindFirst },
    contractorProjectInvitation: { findFirst: projectInviteFindFirst },
    activityLogEntry: { create: activityCreate },
  }));
});

describe("contractor portal contact linking", () => {
  it("normalizes email and classifies every supported status", () => {
    expect(normalizePortalEmail("  A@Example.COM ")).toBe("a@example.com");
    expect(classifyContractorPortalLink({ linked: true, account: { contractorPortalEnabled: true, status: "Active" }, invitePending: false })).toBe("Linked");
    expect(classifyContractorPortalLink({ linked: false, account: { contractorPortalEnabled: true, status: "Active" }, invitePending: false })).toBe("AccountFound");
    expect(classifyContractorPortalLink({ linked: false, account: { contractorPortalEnabled: false, status: "Active" }, invitePending: false })).toBe("Disabled");
    expect(classifyContractorPortalLink({ linked: false, account: null, invitePending: true })).toBe("InvitePending");
    expect(classifyContractorPortalLink({ linked: false, account: null, invitePending: false })).toBe("NotFound");
  });

  it("requires authentication and contacts edit permission", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await POST(request, ctx)).status).toBe(401);
    getCurrentUser.mockResolvedValueOnce(user);
    can.mockResolvedValueOnce(false);
    expect((await POST(request, ctx)).status).toBe(403);
    expect(contactFindFirst).not.toHaveBeenCalled();
  });

  it("re-reads and scopes the contact inside the transaction", async () => {
    txContactFindFirst.mockResolvedValueOnce(null);
    const res = await POST(request, ctx);
    expect(res.status).toBe(404);
    expect(txContactFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact-1", companyId: "co1" } }));
    expect(contactFindFirst).not.toHaveBeenCalled();
  });

  it("rejects wrong contact types and missing/invalid email from the transaction read", async () => {
    txContactFindFirst.mockResolvedValueOnce(contact({ type: "Vendor" }));
    expect((await POST(request, ctx)).status).toBe(400);
    txContactFindFirst.mockResolvedValueOnce(contact({ email: null }));
    expect((await POST(request, ctx)).status).toBe(400);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(contactUpdateMany).not.toHaveBeenCalled();
  });

  it("uses the transaction-read email to link an existing enabled account", async () => {
    const current = contact({ email: " current@example.com " });
    txContactFindFirst.mockResolvedValue(current);
    cpAccountFindUnique.mockResolvedValue({ id: "cp-1", email: "current@example.com", contractorPortalEnabled: true, status: "Active" });
    txContactFindFirst.mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, contractorPortalAccountId: "cp-1", contractorPortalLinkStatus: "Linked" });
    const res = await POST(request, ctx);
    expect(res.status).toBe(200);
    expect(cpAccountFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "current@example.com" } }));
    expect(contactUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ email: " current@example.com ", type: "Contractor", companyId: "co1" }),
      data: { contractorPortalAccountId: "cp-1", contractorPortalLinkStatus: "Linked" },
    }));
    expect(activityCreate).toHaveBeenCalledTimes(1);
  });

  it("classifies an active company-scoped project invitation as InvitePending", async () => {
    projectInviteFindFirst.mockResolvedValue({ id: "project-invite-1" });
    txContactFindFirst.mockResolvedValueOnce(contact()).mockResolvedValueOnce({ ...contact(), contractorPortalLinkStatus: "InvitePending" });
    const res = await POST(request, ctx);
    expect(res.status).toBe(200);
    expect(projectInviteFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "co1", contactId: "contact-1", status: "Pending", expiresAt: { gt: expect.any(Date) } },
    }));
    expect(contactUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { contractorPortalAccountId: null, contractorPortalLinkStatus: "InvitePending" } }));
  });

  it("does not overwrite a contact changed after the transaction read", async () => {
    contactUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(request, ctx);
    expect(res.status).toBe(409);
    expect(activityCreate).not.toHaveBeenCalled();
    expect(contactUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ email: " Contractor@Example.com ", contractorPortalAccountId: null, contractorPortalLinkStatus: "NotFound" }),
    }));
  });
});
