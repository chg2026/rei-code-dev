import { prisma } from "../prisma";
import { Prisma, InvoiceClassification } from "@prisma/client";

/**
 * Per-phase invoice figures.
 *
 * Actual (recognised spend) is bucketed by the invoice's classification:
 * Labor → labor, Materials → materials, everything else (Permit / Dumpster /
 * Utility / Other) → other. total is always labor + materials + other.
 *
 * committed is the phase's share of every invoice regardless of payment
 * status (Unpaid, Pending, Paid) — same allocation rules as Actual but with
 * no payment gate, so committed >= total for each phase.
 */
export type PhaseActualBreakdown = {
  labor: Prisma.Decimal;
  materials: Prisma.Decimal;
  other: Prisma.Decimal;
  total: Prisma.Decimal;
  committed: Prisma.Decimal;
};

type Bucket = "labor" | "materials" | "other";

const bucketOf = (c: InvoiceClassification): Bucket =>
  c === InvoiceClassification.Labor
    ? "labor"
    : c === InvoiceClassification.Materials
      ? "materials"
      : "other";

/**
 * Compute per-phase actual + committed spend for every phase in a project
 * from invoices (see PhaseActualBreakdown).
 *
 * Allocation of an invoice across phases (shared by Actual and Committed):
 *   - Each InvoiceJobType.amount goes to its phase. If every job-type amount
 *     is $0 but at least one job type is tagged to a phase, the invoice's
 *     full amount is split evenly across the tagged phases instead (never
 *     both). Invoices with no phase-tagged job types remain unallocated.
 *
 * Recognised (Actual) spend per invoice:
 *   - No stages: the allocation counts only when the invoice is Paid (the
 *     long-standing behaviour).
 *   - Has stages: only the Paid stages count, regardless of the invoice-level
 *     status. The paid-stage total is allocated across the invoice's job
 *     types proportionally to each job type's amount, so a partially-paid
 *     staged invoice contributes a partial actual to each phase it touches.
 *
 * Committed per invoice: the full allocation, for every invoice regardless
 * of invoice status or stage payment.
 *
 * Every Actual amount an invoice contributes lands in the bucket matching
 * that invoice's classification, so the buckets always sum to the total.
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
  const entryFor = (phaseId: string): PhaseActualBreakdown => {
    let entry = map.get(phaseId);
    if (!entry) {
      entry = {
        labor: new Prisma.Decimal(0),
        materials: new Prisma.Decimal(0),
        other: new Prisma.Decimal(0),
        total: new Prisma.Decimal(0),
        committed: new Prisma.Decimal(0),
      };
      map.set(phaseId, entry);
    }
    return entry;
  };
  const addActual = (phaseId: string, bucket: Bucket, value: Prisma.Decimal) => {
    const entry = entryFor(phaseId);
    entry[bucket] = entry[bucket].plus(value);
    entry.total = entry.total.plus(value);
  };
  const addCommitted = (phaseId: string, value: Prisma.Decimal) => {
    const entry = entryFor(phaseId);
    entry.committed = entry.committed.plus(value);
  };

  for (const inv of invoices) {
    const bucket = bucketOf(inv.classification);
    const allocated = inv.jobTypes.reduce(
      (sum, jt) => sum.plus(jt.amount),
      new Prisma.Decimal(0)
    );
    // Distinct phases tagged by the invoice's job types — the target of the
    // even-split fallback when the job-type amounts sum to $0.
    const taggedPhaseIds = Array.from(
      new Set(
        inv.jobTypes.map((jt) => jt.phaseId).filter((p): p is string => !!p)
      )
    );

    // Committed: full allocation for every invoice, no payment gate.
    if (allocated.greaterThan(0)) {
      for (const jt of inv.jobTypes) {
        if (!jt.phaseId) continue;
        addCommitted(jt.phaseId, new Prisma.Decimal(jt.amount));
      }
    } else if (taggedPhaseIds.length > 0) {
      const share = new Prisma.Decimal(inv.amount).div(taggedPhaseIds.length);
      for (const phaseId of taggedPhaseIds) addCommitted(phaseId, share);
    }

    // Actual: payment-gated recognised spend.
    const hasStages = inv.stages.length > 0;
    if (hasStages) {
      const paidTotal = inv.stages
        .filter((s) => s.status === "Paid")
        .reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0));
      if (paidTotal.isZero()) continue;
      if (allocated.isZero()) continue;
      for (const jt of inv.jobTypes) {
        if (!jt.phaseId) continue;
        // proportional share of the paid-stage total
        addActual(
          jt.phaseId,
          bucket,
          paidTotal.times(new Prisma.Decimal(jt.amount).div(allocated))
        );
      }
    } else {
      if (inv.status !== "Paid") continue;
      if (allocated.greaterThan(0)) {
        for (const jt of inv.jobTypes) {
          if (!jt.phaseId) continue;
          addActual(jt.phaseId, bucket, new Prisma.Decimal(jt.amount));
        }
      } else if (taggedPhaseIds.length > 0) {
        // Fallback: job types tag phases but carry $0 amounts — spread the
        // invoice total evenly across the tagged phases instead.
        const share = new Prisma.Decimal(inv.amount).div(taggedPhaseIds.length);
        for (const phaseId of taggedPhaseIds) addActual(phaseId, bucket, share);
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
