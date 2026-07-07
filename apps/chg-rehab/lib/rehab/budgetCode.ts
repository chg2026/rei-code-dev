/**
 * Two-segment budget code — the universal join key between a phase (job
 * type) and a cost type. Derived entirely from existing fields
 * (Phase.number + Invoice.classification); nothing is persisted.
 *
 * Example: phase 4 + Labor → "04 · Labor".
 */
export const phaseCode = (phaseNumber: number): string =>
  String(phaseNumber).padStart(2, "0");

export const budgetCode = (phaseNumber: number, costType: string): string =>
  `${phaseCode(phaseNumber)} · ${costType}`;
