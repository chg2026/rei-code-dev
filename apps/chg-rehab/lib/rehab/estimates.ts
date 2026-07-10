/**
 * Estimate line/total math shared by the Scenario Estimator client and the
 * estimates API. Pure — no Prisma/server imports.
 */

export type EstimateLineLike = {
  laborCost: number;
  materialCost: number;
  unitPrice: number | null;
  quantity: number | null;
};

/** Line total = labor + material + unitPrice×quantity (unit part optional). */
export function estimateLineTotal(l: EstimateLineLike): number {
  const unitPart = l.unitPrice != null && l.quantity != null ? l.unitPrice * l.quantity : 0;
  return l.laborCost + l.materialCost + unitPart;
}

export type EstimateTotals = {
  labor: number;
  material: number;
  /** Σ unitPrice×quantity across lines. */
  unitPriced: number;
  grand: number;
  /** grand ÷ sqft, or null when sqft is unset/0. */
  perSqft: number | null;
};

export function estimateTotals(lines: EstimateLineLike[], sqft: number | null): EstimateTotals {
  let labor = 0;
  let material = 0;
  let unitPriced = 0;
  for (const l of lines) {
    labor += l.laborCost;
    material += l.materialCost;
    unitPriced += l.unitPrice != null && l.quantity != null ? l.unitPrice * l.quantity : 0;
  }
  const grand = labor + material + unitPriced;
  return {
    labor,
    material,
    unitPriced,
    grand,
    perSqft: sqft && sqft > 0 ? grand / sqft : null,
  };
}
