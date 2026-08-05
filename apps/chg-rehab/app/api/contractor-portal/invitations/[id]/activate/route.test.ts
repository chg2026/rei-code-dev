import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invitation: null as any,
  assignment: null as any,
  job: null as any,
  activities: [] as any[],
  casCount: 1,
  writes: 0,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ can: vi.fn() }));
vi.mock("@/lib/billing-gate", () => ({ billingBlockedResponse: vi.fn() }));
vi.mock("@/lib/assignmentGate", () => ({ evaluateAssignmentCompliance: vi.fn() }));
vi.mock("@/lib/contractorPortalBridge", () => ({
  ensureContractorPortalJob: vi.fn(async () => {
    state.writes++;
    state.job = { id: "job-1" };
    return "job-1";
  }),
}));
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  return {
    Prisma: { PrismaClientKnownRequestError, TransactionIsolationLevel: { Serializable: "Serializable" } },
  };
});
vi.mock("@/lib/prisma", () => {
  const relations = (row: any) => ({
    ...row,
    contact: { id: row.contactId, name: "Build Co", email: "build@example.com", type: "Contractor" },
    project: { id: row.projectId, code: "P-1", name: "Project One" },
    cpAccount: row.cpAccountId ? { id: row.cpAccountId, email: "build@example.com", contractorPortalEnabled: true } : null,
  });
  const invitation = {
    findFirst: vi.fn(async () => state.invitation ? relations(state.invitation) : null),
    updateMany: vi.fn(async () => {
      state.writes++;
      if (state.casCount === 1) state.invitation.status = "Activated";
      return { count: state.casCount };
    }),
    update: vi.fn(async ({ data }: any) => {
      state.writes++;
      Object.assign(state.invitation, data);
      return relations(state.invitation);
    }),
  };
  const tx = {
    contact: { findFirst: vi.fn(async () => ({ id: "c-1" })) },
    project: { findFirst: vi.fn(async () => ({ id: "p-1" })) },
    contractorProjectInvitation: invitation,
    contractorAssignment: {
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => {
        state.writes++;
        state.assignment ??= { id: "assignment-1" };
        return state.assignment;
      }),
    },
    activityLogEntry: { create: vi.fn(async ({ data }: any) => { state.writes++; state.activities.push(data); }) },
  };
  return {
    prisma: {
      contractorProjectInvitation: invitation,
      contractorAssignment: { findFirst: vi.fn(async () => state.assignment) },
      cpJob: { findFirst: vi.fn(async () => state.job) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { evaluateAssignmentCompliance } from "@/lib/assignmentGate";

const auth = vi.mocked(getCurrentUser);
const permission = vi.mocked(can);
const billing = vi.mocked(billingBlockedResponse);
const compliance = vi.mocked(evaluateAssignmentCompliance);
const ctx = { params: Promise.resolve({ id: "inv-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  state.invitation = {
    id: "inv-1", companyId: "co-1", projectId: "p-1", contactId: "c-1", cpAccountId: "cp-1",
    status: "Accepted", role: "GC", roleKey: "gc", trade: "GC", emailSnapshot: "build@example.com",
    agreementVersion: "v1", agreementAcceptedAt: new Date(), documentGateState: "Pending", complianceGateState: "Pending",
  };
  state.assignment = null; state.job = null; state.activities = []; state.casCount = 1; state.writes = 0;
  auth.mockResolvedValue({ id: "u-1", companyId: "co-1", role: "Admin", email: "a@example.com", firstName: "A", lastName: "U" } as any);
  permission.mockResolvedValue(true); billing.mockResolvedValue(null);
  compliance.mockResolvedValue({ missingRequired: [], warnings: [], allowed: true, blockingEnabled: false, requirements: { w9: true, coi: true, license: true } });
});

describe("contractor invitation activation route", () => {
  it("rejects unauthorized", async () => { auth.mockResolvedValue(null); expect((await POST(new Request("http://test"), ctx)).status).toBe(401); });
  it("rejects a non-Accepted invitation without writes", async () => { state.invitation.status = "Pending"; expect((await POST(new Request("http://test"), ctx)).status).toBe(409); expect(state.writes).toBe(0); });
  it("rejects missing agreement or account without writes", async () => {
    state.invitation.agreementAcceptedAt = null; expect((await POST(new Request("http://test"), ctx)).status).toBe(412); expect(state.writes).toBe(0);
    state.invitation.agreementAcceptedAt = new Date(); state.invitation.cpAccountId = null; expect((await POST(new Request("http://test"), ctx)).status).toBe(412); expect(state.writes).toBe(0);
  });
  it("rejects missing compliance even when legacy blocking is disabled", async () => {
    compliance.mockResolvedValue({ missingRequired: ["COI missing"], warnings: [{ message: "COI missing" }], allowed: true, blockingEnabled: false, requirements: { w9: true, coi: true, license: true } } as any);
    expect((await POST(new Request("http://test"), ctx)).status).toBe(412); expect(state.writes).toBe(0);
  });
  it("returns 409 when the Accepted CAS is lost", async () => { state.casCount = 0; expect((await POST(new Request("http://test"), ctx)).status).toBe(409); expect(state.writes).toBe(1); });
  it("activates the invitation and records one assignment, job, and activity", async () => {
    const res = await POST(new Request("http://test"), ctx); const body = await res.json();
    expect(res.status).toBe(200); expect(body).toMatchObject({ assignmentId: "assignment-1", portalJobId: "job-1", activeAccessGranted: true });
    expect(body.invitation.status).toBe("Activated"); expect(state.activities).toHaveLength(1);
  });
  it("is idempotent for an already Activated invitation", async () => {
    state.invitation.status = "Activated"; state.assignment = { id: "assignment-existing" }; state.job = { id: "job-existing" };
    const res = await POST(new Request("http://test"), ctx); const body = await res.json();
    expect(res.status).toBe(200); expect(body.assignmentId).toBe("assignment-existing"); expect(body.portalJobId).toBe("job-existing"); expect(state.writes).toBe(0); expect(state.activities).toHaveLength(0);
  });
});
