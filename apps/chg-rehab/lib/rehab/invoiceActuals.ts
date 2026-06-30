import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

/**
 * Compute Phase."actual" for every phase in a project from invoice spend.
 *
 * Recognised spend per invoice:
 *   - No stages: the invoice's job-type amounts count when the invoice is Paid
 *     (the long-standing behaviour — each InvoiceJobType.amount rolls into its
 *     phase).
 *   - Has stages: only the Paid stages count, regardless of the invoice-level
 *     status. The paid-stage total is allocated across the invoice's job types
 *     proportionally to each job type's amount, so a partially-paid staged
 *     invoice contributes a partial actual to each phase it touches.
 *
 * Returns a map of phaseId -> recognised actual (Decimal).
 */
export async function computePhaseActuals(
  projectId: string
): Promise<Map<string, Prisma.Decimal>> {
  const invoices = await prisma.invoice.findMany({
    where: { projectId },
    select: {
      amount: true,
      status: true,
      jobTypes: { select: { phaseId: true, amount: true } },
      stages: { select: { amount: true, status: true } },
    },
  });

  const map = new Map<string, Prisma.Decimal>();
  const add = (phaseId: string, value: Prisma.Decimal) => {
    map.set(phaseId, (map.get(phaseId) ?? new Prisma.Decimal(0)).plus(value));
  };

  for (const inv of invoices) {
    const hasStages = inv.stages.length > 0;

    if (hasStages) {
      const paidTotal = inv.stages
        .filter((s) => s.status === "Paid")
        .reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0));
      if (paidTotal.isZero()) continue;
      const jtTotal = inv.jobTypes.reduce(
        (sum, jt) => sum.plus(jt.amount),
        new Prisma.Decimal(0)
      );
      if (jtTotal.isZero()) continue;
      for (const jt of inv.jobTypes) {
        if (!jt.phaseId) continue;
        // proportional share of the paid-stage total
        add(jt.phaseId, paidTotal.times(new Prisma.Decimal(jt.amount).div(jtTotal)));
      }
    } else {
      if (inv.status !== "Paid") continue;
      for (const jt of inv.jobTypes) {
        if (!jt.phaseId) continue;
        add(jt.phaseId, new Prisma.Decimal(jt.amount));
      }
    }
  }

  return map;
}

/**
 * Recompute Phase."actual" for the given phases and persist the result. Called
 * after any invoice / stage create / update / delete so the budget stays in
 * sync.
 */
export async function recomputePhaseActuals(
  projectId: string,
  phaseIds: Array<string | null | undefined>
): Promise<void> {
  const ids = Array.from(new Set(phaseIds.filter((p): p is string => !!p)));
  if (ids.length === 0) return;
  const actuals = await computePhaseActuals(projectId);
  for (const phaseId of ids) {
    const total = actuals.get(phaseId) ?? new Prisma.Decimal(0);
    await prisma.phase.updateMany({
      where: { id: phaseId, projectId },
      data: { actual: total },
    });
  }
}
