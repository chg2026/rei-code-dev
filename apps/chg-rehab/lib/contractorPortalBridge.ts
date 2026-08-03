type PortalBridgeTx = {
  cpOperatorEdge: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<unknown>;
  };
  cpJob: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
};

export type ContractorPortalBridgeInput = {
  contractorId: string;
  companyId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  role: string;
  portalEnabled: boolean;
};

/**
 * Projects remain owned by CHG. This helper only mirrors an assignment into
 * the shared Contractor Portal graph when an existing enabled portal account
 * is already known; it never provisions an identity or bypasses compliance.
 */
export async function ensureContractorPortalJob(
  tx: PortalBridgeTx,
  input: ContractorPortalBridgeInput,
): Promise<string | null> {
  if (!input.portalEnabled) return null;

  const existingEdge = await tx.cpOperatorEdge.findFirst({
    where: { contractorId: input.contractorId, layer1CompanyId: input.companyId },
    select: { id: true },
  });
  if (!existingEdge) {
    await tx.cpOperatorEdge.create({
      data: {
        contractorId: input.contractorId,
        layer1CompanyId: input.companyId,
        source: "manual",
      },
    });
  }

  const existingJob = await tx.cpJob.findFirst({
    where: {
      contractorId: input.contractorId,
      projectId: input.projectId,
      awardedByCompanyId: input.companyId,
    },
    select: { id: true },
  });
  if (existingJob) return existingJob.id;

  const job = await tx.cpJob.create({
    data: {
      contractorId: input.contractorId,
      projectId: input.projectId,
      name: input.projectName,
      subtitle: input.projectCode,
      trade: input.role,
      awardedByCompanyId: input.companyId,
      status: "active",
    },
    select: { id: true },
  });
  return job.id;
}
