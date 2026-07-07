/**
 * Earned-value forecasting math (§2.3 intent).
 *
 * Pure helpers shared by the Budget & Costs tab (per-phase forecast columns)
 * and the Overview pace signal. Kept free of Prisma/server imports so it can
 * run in a client component too.
 *
 * Mapping note: with no Commitments / Change Orders yet, `committed` is the
 * Procore "Projected Costs" (every invoice, any status) and `actual` is
 * "Job-to-Date" (paid allocation). Both come from computePhaseActualBreakdowns.
 */

export type ForecastMethodName = "Auto" | "Manual" | "PercentComplete";

/**
 * Effective %-complete for a phase and where it came from.
 *
 *   - Phase.percentComplete when it's been set (> 0) → "manual".
 *   - else the checklist completion ratio when the phase has items → "checklist".
 *   - else unknown (null): no explicit % and no checklist to infer from.
 *
 * A checklist item counts as complete when it is Done or NA (mirrors the
 * incompleteChecklist gate used elsewhere).
 */
export function effectivePct(
  percentComplete: number,
  checklistDone: number,
  checklistTotal: number
): { pct: number | null; source: "manual" | "checklist" | null } {
  if (percentComplete > 0) {
    return { pct: Math.max(0, Math.min(100, Math.round(percentComplete))), source: "manual" };
  }
  if (checklistTotal > 0) {
    return { pct: Math.round((checklistDone / checklistTotal) * 100), source: "checklist" };
  }
  return { pct: null, source: null };
}

export type ForecastInput = {
  budget: number;
  committed: number;
  actual: number;
  percentComplete: number;
  forecastMethod: ForecastMethodName;
  forecastManual: number | null;
  checklistDone: number;
  checklistTotal: number;
};

export type ForecastResult = {
  /** Estimated Cost at Completion. */
  eac: number;
  /** budget − EAC. Negative = projected over budget. */
  projected: number;
  pct: number | null;
  pctSource: "manual" | "checklist" | null;
};

/**
 * Estimated Cost at Completion (EAC) and Projected Over/Under for one phase.
 *
 *   - Manual override → committed + forecastManual.
 *   - else known pct > 0 (cost-to-cost earned value) → actual / (pct / 100).
 *   - else (Auto / no pct) → max(budget, committed).
 */
export function computeForecast(i: ForecastInput): ForecastResult {
  const { pct, source } = effectivePct(i.percentComplete, i.checklistDone, i.checklistTotal);
  let eac: number;
  if (i.forecastMethod === "Manual" && i.forecastManual != null) {
    eac = i.committed + i.forecastManual;
  } else if (pct != null && pct > 0) {
    eac = i.actual / (pct / 100);
  } else {
    eac = Math.max(i.budget, i.committed);
  }
  return { eac, projected: i.budget - eac, pct, pctSource: source };
}
