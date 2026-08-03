import { describe, expect, it, vi } from "vitest";
import { ensureContractorPortalJob } from "./contractorPortalBridge";

type Edge = { id: string } | null;
type Job = { id: string } | null;

function makeTx(opts: { edge?: Edge; job?: Job } = {}) {
  const edge = opts.edge ?? null;
  const job = opts.job ?? null;
  return {
    cpOperatorEdge: {
      findFirst: vi.fn(async () => edge),
      create: vi.fn(async () => ({ id: "edge-created" })),
    },
    cpJob: {
      findFirst: vi.fn(async () => job),
      create: vi.fn(async () => ({ id: "job-created" })),
    },
  };
}

const input = {
  contractorId: "cp-1",
  companyId: "company-1",
  projectId: "project-1",
  projectName: "123 Test Ave Rehab",
  projectCode: "CHG-1001",
  role: "General Contractor",
};

describe("ensureContractorPortalJob", () => {
  it("fails closed to no portal job when the account is disabled", async () => {
    const tx = makeTx();

    const result = await ensureContractorPortalJob(tx, { ...input, portalEnabled: false });

    expect(result).toBeNull();
    expect(tx.cpOperatorEdge.findFirst).not.toHaveBeenCalled();
    expect(tx.cpJob.create).not.toHaveBeenCalled();
  });

  it("creates the operator edge and project-linked active job for an enabled account", async () => {
    const tx = makeTx();

    const result = await ensureContractorPortalJob(tx, { ...input, portalEnabled: true });

    expect(result).toBe("job-created");
    expect(tx.cpOperatorEdge.create).toHaveBeenCalledWith({
      data: { contractorId: "cp-1", layer1CompanyId: "company-1", source: "manual" },
    });
    expect(tx.cpJob.create).toHaveBeenCalledWith({
      data: {
        contractorId: "cp-1",
        projectId: "project-1",
        name: "123 Test Ave Rehab",
        subtitle: "CHG-1001",
        trade: "General Contractor",
        awardedByCompanyId: "company-1",
        status: "active",
      },
      select: { id: true },
    });
  });

  it("reuses existing edge and job without duplicating the portal record", async () => {
    const tx = makeTx({ edge: { id: "edge-existing" }, job: { id: "job-existing" } });

    const result = await ensureContractorPortalJob(tx, { ...input, portalEnabled: true });

    expect(result).toBe("job-existing");
    expect(tx.cpOperatorEdge.create).not.toHaveBeenCalled();
    expect(tx.cpJob.create).not.toHaveBeenCalled();
  });
});
