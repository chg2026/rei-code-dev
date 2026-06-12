import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

/**
 * Recompute Phase."actual" for the given phases from Paid invoice job types.
 *
 * Actual spend on a phase (job type) is the sum of every InvoiceJobType.amount
 * whose parent Invoice is marked Paid and belongs to this project. Called after
 * any invoice create / update / delete so the budget stays in sync.
 */
export async function recomputePhaseActuals(
  projectId: string,
  phaseIds: Array<string | null | undefined>
): Promise<void> {
  const ids = Array.from(new Set(phaseIds.filter((p): p is string => !!p)));
  for (const phaseId of ids) {
    const rows = await prisma.invoiceJobType.findMany({
      where: { phaseId, invoice: { projectId, status: "Paid" } },
      select: { amount: true },
    });
    const total = rows.reduce(
      (sum, r) => sum.plus(r.amount),
      new Prisma.Decimal(0)
    );
    await prisma.phase.updateMany({
      where: { id: phaseId, projectId },
      data: { actual: total },
    });
  }
}
