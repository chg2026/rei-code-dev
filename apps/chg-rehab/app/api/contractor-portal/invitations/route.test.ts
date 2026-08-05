import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

const db = vi.hoisted(() => ({
  projects: [] as any[],
  contacts: [] as any[],
  invitations: [] as any[],
  activity: [] as any[],
  cpAccounts: [] as any[],
  company: { id: "co-1", name: "CHG Company" },
  seq: 0,
  reset() { this.projects = []; this.contacts = []; this.invitations = []; this.activity = []; this.cpAccounts = []; this.seq = 0; },
}));

const delivery = vi.hoisted(() => ({
  send: vi.fn(async () => ({ delivered: true, messageId: "msg-1" })),
}));
vi.mock("@/lib/contractorProjectInvitationEmail", () => ({
  createContractorInviteToken: vi.fn(() => ({ rawToken: "raw-secret", tokenHash: "hash-only" })),
  buildContractorInviteJoinUrl: vi.fn((token: string) => `https://contractor.doorine.com/accept-invite?token=${token}`),
  sendContractorProjectInvitationEmail: delivery.send,
}));

vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  return {
    ContactType: { Contractor: "Contractor", Subcontractor: "Subcontractor", Vendor: "Vendor" },
    Prisma: { PrismaClientKnownRequestError },
  };
});

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ can: vi.fn() }));
vi.mock("@/lib/billing-gate", () => ({ billingBlockedResponse: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const match = (row: any, where: any) => Object.entries(where ?? {}).every(([key, value]) => {
    if (key === "OR") return (value as any[]).some((part) => match(row, part));
    if (typeof value === "object" && value !== null) return Object.entries(value).every(([k, v]) => row[k] === v);
    return row[key] === value;
  });
  const invitationTable = {
    findUnique: async ({ where, include }: any) => {
      const key = where.companyId_projectId_contactId_roleKey;
      const row = db.invitations.find((r) => r.companyId === key.companyId && r.projectId === key.projectId && r.contactId === key.contactId && r.roleKey === key.roleKey);
      return row ? withRelations(row, include) : null;
    },
    findMany: async ({ where, include }: any) => db.invitations.filter((r) => match(r, where)).map((r) => withRelations(r, include)),
    create: async ({ data, include }: any) => {
      const row = { id: `inv-${++db.seq}`, status: "Pending", documentGateState: "Pending", complianceGateState: "Pending", invitedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), ...data };
      db.invitations.push(row);
      return withRelations(row, include);
    },
    update: async ({ where, data, include }: any) => {
      const row = db.invitations.find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return withRelations(row, include);
    },
  };
  const withRelations = (row: any, _include: any) => ({ ...row, contact: db.contacts.find((c) => c.id === row.contactId), project: db.projects.find((p) => p.id === row.projectId) });
  const tx = {
    contractorProjectInvitation: invitationTable,
    cpAccount: { findUnique: async ({ where }: any) => db.cpAccounts.find((a) => a.email === where.email) ?? null },
    activityLogEntry: { create: async ({ data }: any) => { db.activity.push(data); return data; } },
  };
  return {
    prisma: {
      project: { findFirst: async ({ where }: any) => db.projects.find((p) => match(p, where)) ?? null },
      contact: { findFirst: async ({ where }: any) => db.contacts.find((c) => match(c, where)) ?? null },
      contractorProjectInvitation: invitationTable,
      company: { findUnique: async ({ where }: any) => db.company.id === where.id ? db.company : null },
      $transaction: async (fn: any) => fn(tx),
    },
  };
});

import { GET, POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

const auth = vi.mocked(getCurrentUser);
const permission = vi.mocked(can);
const billing = vi.mocked(billingBlockedResponse);

const user = (companyId = "co-1"): SessionUser => ({ id: "u-1", companyId, role: "Admin", email: "admin@example.com", firstName: "A", lastName: "U" });
const request = (method: string, body?: unknown, query = "") => new NextRequest(`http://test/api/contractor-portal/invitations${query}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks(); db.reset(); delivery.send.mockResolvedValue({ delivered: true, messageId: "msg-1" }); auth.mockResolvedValue(user()); permission.mockResolvedValue(true); billing.mockResolvedValue(null);
  db.projects.push({ id: "p-1", companyId: "co-1", code: "CHG-1", name: "Project One" });
  db.contacts.push({ id: "c-1", companyId: "co-1", type: "Contractor", name: "Build Co", email: "Build@Example.com", trade: "GC" });
});

describe("contractor project invitations route", () => {
  it("requires authentication", async () => { auth.mockResolvedValue(null); const res = await POST(request("POST", {})); expect(res.status).toBe(401); });
  it("rejects cross-company project/contact references", async () => {
    db.projects.push({ id: "p-other", companyId: "co-2", code: "OTHER", name: "Other" });
    const res = await POST(request("POST", { projectId: "p-other", contactId: "c-1", role: "GC", agreementVersion: "v1" }));
    expect(res.status).toBe(404); expect(db.invitations).toHaveLength(0);
  });
  it("rejects non-contractor contacts and missing email", async () => {
    db.contacts[0].type = "Vendor";
    expect((await POST(request("POST", { projectId: "p-1", contactId: "c-1", role: "GC", agreementVersion: "v1" }))).status).toBe(400);
    db.contacts[0].type = "Contractor"; db.contacts[0].email = null;
    expect((await POST(request("POST", { projectId: "p-1", contactId: "c-1", role: "GC", agreementVersion: "v1" }))).status).toBe(400);
  });
  it("creates a pending invitation and activity entry", async () => {
    db.cpAccounts.push({ id: "cp-1", email: "build@example.com" });
    const res = await POST(request("POST", { projectId: "p-1", contactId: "c-1", role: " GC ", agreementVersion: "v1" }));
    expect(res.status).toBe(201); expect((await res.json()).invitation).toMatchObject({ status: "Pending", roleKey: "gc", cpAccountId: "cp-1", inviteDeliveryStatus: "Delivered" }); expect(db.activity).toHaveLength(1);
    expect(db.invitations[0].inviteTokenHash).toBe("hash-only"); expect(db.invitations[0].inviteTokenHash).not.toContain("raw-secret");
    expect(delivery.send).toHaveBeenCalledTimes(1); expect(delivery.send.mock.calls[0]?.[0]?.joinUrl).toContain("raw-secret");
  });
  it("is idempotent on the Prisma unique key", async () => {
    const body = { projectId: "p-1", contactId: "c-1", role: "GC", agreementVersion: "v1" };
    expect((await POST(request("POST", body))).status).toBe(201);
    const second = await POST(request("POST", body));
    expect(second.status).toBe(200); expect((await second.json()).duplicate).toBe(true); expect(db.invitations).toHaveLength(1); expect(db.activity).toHaveLength(1); expect(delivery.send).toHaveBeenCalledTimes(1);
  });
  it("scopes GET results to the current company and project", async () => {
    db.invitations.push({ id: "i-1", companyId: "co-1", projectId: "p-1", contactId: "c-1", roleKey: "gc", role: "GC", emailSnapshot: "build@example.com", agreementVersion: "v1", trade: "GC", status: "Pending", invitedAt: new Date(), expiresAt: new Date(), documentGateState: "Pending", complianceGateState: "Pending", cpAccountId: null });
    db.projects.push({ id: "p-2", companyId: "co-2", code: "OTHER", name: "Other" }); db.invitations.push({ id: "i-2", companyId: "co-2", projectId: "p-2", contactId: "c-2", roleKey: "gc", role: "GC", emailSnapshot: "other@example.com", agreementVersion: "v1", trade: null, status: "Pending", invitedAt: new Date(), expiresAt: new Date(), documentGateState: "Pending", complianceGateState: "Pending", cpAccountId: null });
    const res = await GET(request("GET")); expect(res.status).toBe(200); expect((await res.json()).invitations.map((i: any) => i.id)).toEqual(["i-1"]);
  });
});
