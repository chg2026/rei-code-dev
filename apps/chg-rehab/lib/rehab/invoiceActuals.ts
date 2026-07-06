import { prisma } from "../prisma";
import { Prisma, InvoiceClassification } from "@prisma/client";

/**
 * Per-phase actual spend, bucketed by the invoice's classification:
 * Labor → labor, Materials → materials, everything else (Permit / Dumpster /
 * Utility / Other) → other. total is always labor + materials + other.
 */
export type PhaseActualBreakdown = {
  labor: Prisma.Decimal;
  materials: Prisma.Decimal;
  other: Prisma.Decimal;
  total: Prisma.Decimal;
};

type Bucket = "labor" | "materials" | "other";

const bucketOf = (c: InvoiceClassification): Bucket =>
  c === InvoiceClassification.Labor
    ? "labor"
    : c === InvoiceClassification.Materials
      ? "materials"
      : "other";

/**
 * Compute per-phase actual spend for every phase in a project from invoice
 * spend, broken down by cost type (see PhaseActualBreakdown).
 *
 * Recognised spend per invoice:
 *   - No stages: the invoice's job-type amounts count when the invoice is Paid
 *     (the long-standing behaviour — each InvoiceJobType.amount rolls into its
 *     phase). If every job-type amount is $0 but at least one job type is
 *     tagged to a phase, the invoice's full amount is split evenly across the
 *     tagged phases instead (never both). Paid invoices with no phase-tagged
 *     job types remain unallocated.
 *   - Has stages: only the Paid stages count, regardless of the invoice-level
 *     status. The paid-stage total is allocated across the invoice's job types
 *     proportionally to each job type's amount, so a partially-paid staged
 *     invoice contributes a partial actual to each phase it touches.
 *
 * Every amount an invoice contributes lands in the bucket matching that
 * invoice's classification, so the buckets always sum to the total.
 */
export async function computePhaseActualBreakdowns(
  projectId: string
): Promise<Map<string, PhaseActualBreakdown>> {
  const invoices = await prisma.invoice.findMany({
    where: { projectId },
    select: {
      amount: true,
      status: true,
      classification: true,
      jobTypes: { select: { phaseId: true, amount: true } },
      stages: { select: { amount: true, status: true } },
    },
  });

  const map = new Map<string, PhaseActualBreakdown>();
  const add = (phaseId: string, bucket: Bucket, value: Prisma.Decimal) => {
    const entry = map.get(phaseId) ?? {
      labor: new Prisma.Decimal(0),
      materials: new Prisma.Decimal(0),
      other: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    };
    entry[bucket] = entry[bucket].plus(value);
    entry.total = entry.total.plus(value);
    map.set(phaseId, entry);
  };

  for (const inv of invoices) {
    const bucket = bucketOf(inv.classification);
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
        add(jt.phaseId, bucket, paidTotal.times(new Prisma.Decimal(jt.amount).div(jtTotal)));
      }
    } else {
      if (inv.status !== "Paid") continue;
      const allocated = inv.jobTypes.reduce(
        (sum, jt) => sum.plus(jt.amount),
        new Prisma.Decimal(0)
      );
      if (allocated.greaterThan(0)) {
        for (const jt of inv.jobTypes) {
          if (!jt.phaseId) continue;
          add(jt.phaseId, bucket, new Prisma.Decimal(jt.amount));
        }
      } else {
        // Fallback: job types tag phases but carry $0 amounts — spread the
        // invoice total evenly across the tagged phases instead. Invoices
        // with no phase-tagged job types stay unallocated.
        const phaseIds = Array.from(
          new Set(
            inv.jobTypes
              .map((jt) => jt.phaseId)
              .filter((p): p is string => !!p)
          )
        );
        if (phaseIds.length > 0) {
          const share = new Prisma.Decimal(inv.amount).div(phaseIds.length);
          for (const phaseId of phaseIds) add(phaseId, bucket, share);
        }
      }
    }
  }

  return map;
}

/**
 * Compute Phase."actual" for every phase in a project from invoice spend.
 * Thin wrapper over computePhaseActualBreakdowns — returns just the totals so
 * existing callers (SOW tab, invoice routes) keep their shape.
 *
 * Returns a map of phaseId -> recognised actual (Decimal).
 */
export async function computePhaseActuals(
  projectId: string
): Promise<Map<string, Prisma.Decimal>> {
  const breakdowns = await computePhaseActualBreakdowns(projectId);
  const map = new Map<string, Prisma.Decimal>();
  for (const [phaseId, b] of breakdowns) map.set(phaseId, b.total);
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
