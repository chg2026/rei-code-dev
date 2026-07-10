import { computeForecast, type ForecastMethodName } from "./forecast";
import type { PhaseActualBreakdown } from "./invoiceActuals";
import type { PendingChangeOrders } from "./changeOrders";

/** Accepts number or Prisma.Decimal without importing the Prisma runtime. */
type NumericLike = number | string | { toString(): string };

export type ForecastPhaseLike = {
  id: string;
  budget: NumericLike | null;
  percentComplete: number;
  forecastMethod: ForecastMethodName;
  forecastManual: NumericLike | null;
  checklistItems: Array<{ status: string }>;
};

export type ProjectForecastTotals = {
  /** Working budget = Σ phase budgets (approved COs already folded in). */
  workingBudget: number;
  /** Projected Final = Σ per-phase EAC from computeForecast (pending COs included). */
  projectedFinal: number;
  /** workingBudget − projectedFinal. Negative = projected over budget. */
  overUnder: number;
};

/**
 * The single source of truth for the project-level "Projected Final" and
 * "Projected Over/Under" figures. Both the Budget & Costs header KPI and the
 * Overview tile MUST use this so the two never drift apart.
 *
 * Per-phase EAC math lives unchanged in computeForecast (lib/rehab/forecast.ts);
 * this helper only feeds it the same inputs both tabs already load
 * (computePhaseActualBreakdowns + computePendingChangeOrders) and sums the
 * results. Over/Under is measured against the working budget (Σ phase
 * budgets) — never the signed/Approved project budget, which can be $0.
 */
export function computeProjectForecastTotals(
  phases: ForecastPhaseLike[],
  actuals: Map<string, PhaseActualBreakdown>,
  pendingCOs: PendingChangeOrders
): ProjectForecastTotals {
  let workingBudget = 0;
  let projectedFinal = 0;
  for (const p of phases) {
    const budget = p.budget == null ? 0 : Number(p.budget);
    const breakdown = actuals.get(p.id);
    const checklistDone = p.checklistItems.filter(
      (i) => i.status === "Done" || i.status === "NA"
    ).length;
    workingBudget += budget;
    projectedFinal += computeForecast({
      budget,
      committed: Number(breakdown?.committed ?? 0),
      actual: Number(breakdown?.total ?? 0),
      percentComplete: p.percentComplete,
      forecastMethod: p.forecastMethod,
      forecastManual: p.forecastManual == null ? null : Number(p.forecastManual),
      pendingCO: pendingCOs.byPhase.get(p.id) ?? 0,
      checklistDone,
      checklistTotal: p.checklistItems.length,
    }).eac;
  }
  return { workingBudget, projectedFinal, overUnder: workingBudget - projectedFinal };
}
