/**
 * Rehab-to-Return math (Phase 4). Pure helpers — no Prisma/server imports so
 * the Returns tab can recompute live in the client while the portfolio
 * dashboard uses the identical formulas on the server.
 *
 * Rehab cost is always the shared project "Projected Final"
 * (lib/rehab/projectForecast.ts) — never a separately-derived number.
 */

export type ReturnsInputs = {
  arv: number | null;
  acquisitionCost: number | null;
  /** Projected rehab cost = shared Projected Final (Σ per-phase EAC). */
  projectedRehab: number;
  refiLtvPct: number | null;
  refiRatePct: number | null;
  refiTermYears: number | null;
  monthlyRent: number | null;
  monthlyExpenses: number | null;
};

export type ReturnsResult = {
  /** acquisitionCost + projected rehab. */
  allIn: number;
  /** ARV×0.70 − projected rehab (null without ARV). */
  mao70: number | null;
  /** ARV×0.75 − projected rehab (null without ARV). */
  mao75: number | null;
  /** ARV × refiLtvPct/100 (null without ARV + LTV). */
  refiLoan: number | null;
  /** refiLoan ÷ allIn, as a percentage (null without refiLoan or when allIn ≤ 0). */
  recoveryPct: number | null;
  /** allIn − refiLoan (null without refiLoan). */
  cashLeft: number | null;
  /** Monthly amortized payment on the refi loan (null without loan + term). */
  debtService: number | null;
  /** monthlyRent − monthlyExpenses (null until rent is set). */
  noi: number | null;
  /** NOI ÷ debt service (null without both; debt service must be > 0). */
  dscr: number | null;
  /** NOI − debt service (null without both). */
  cashFlow: number | null;
};

/**
 * Standard amortization payment: P·r ÷ (1 − (1+r)^−n) with r = annual%/12,
 * n = years×12. A 0% rate degrades to straight-line principal ÷ n.
 */
export function amortizedMonthlyPayment(
  principal: number,
  annualRatePct: number,
  years: number
): number | null {
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(years) || years <= 0) return null;
  const n = Math.round(years * 12);
  if (n <= 0) return null;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function computeReturns(i: ReturnsInputs): ReturnsResult {
  const allIn = (i.acquisitionCost ?? 0) + i.projectedRehab;

  const mao70 = i.arv != null ? i.arv * 0.7 - i.projectedRehab : null;
  const mao75 = i.arv != null ? i.arv * 0.75 - i.projectedRehab : null;

  const refiLoan =
    i.arv != null && i.refiLtvPct != null ? (i.arv * i.refiLtvPct) / 100 : null;
  const recoveryPct = refiLoan != null && allIn > 0 ? (refiLoan / allIn) * 100 : null;
  const cashLeft = refiLoan != null ? allIn - refiLoan : null;

  const debtService =
    refiLoan != null && i.refiTermYears != null
      ? amortizedMonthlyPayment(refiLoan, i.refiRatePct ?? 0, i.refiTermYears)
      : null;

  const noi = i.monthlyRent != null ? i.monthlyRent - (i.monthlyExpenses ?? 0) : null;
  const dscr = noi != null && debtService != null && debtService > 0 ? noi / debtService : null;
  const cashFlow = noi != null && debtService != null ? noi - debtService : null;

  return { allIn, mao70, mao75, refiLoan, recoveryPct, cashLeft, debtService, noi, dscr, cashFlow };
}

export type DscrBand = "green" | "amber" | "red";

/** DSCR health band: ≥1.25 green, 1.0–1.25 amber, <1.0 red. */
export function dscrBand(dscr: number | null): DscrBand | null {
  if (dscr == null) return null;
  if (dscr >= 1.25) return "green";
  if (dscr >= 1.0) return "amber";
  return "red";
}
