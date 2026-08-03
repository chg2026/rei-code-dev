import type { Prisma } from "@prisma/client";
import {
  type MetaChecklistItem,
  parseMetaChecklist,
  normalizeMetaChecklist,
  checklistProgress,
} from "@/lib/metaChecklist";

/**
 * Property Closing Checklist — the documents/steps that must be captured when a
 * deal closes and a property is created. Stored in property.meta.closing (no
 * schema migration). Editable by the team; these are only the starting items.
 */
export const CLOSING_META_KEY = "closing";

export const DEFAULT_CLOSING_ITEMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "purchase-agreement", label: "Purchase agreement uploaded" },
  { id: "deed-title-transfer", label: "Deed / title transfer uploaded" },
  { id: "settlement-statement", label: "Settlement / closing statement uploaded" },
  { id: "title-insurance", label: "Title insurance uploaded" },
  { id: "property-insurance", label: "Property insurance binder uploaded" },
  { id: "payment-confirmation", label: "Payment / wire confirmation uploaded" },
];

export type ClosingItem = MetaChecklistItem;

export function parseClosing(rawMeta: Prisma.JsonValue | null | undefined) {
  return parseMetaChecklist(rawMeta, CLOSING_META_KEY, DEFAULT_CLOSING_ITEMS);
}

export function normalizeClosingItems(raw: unknown, actorId: string, now?: Date) {
  return normalizeMetaChecklist(raw, actorId, now);
}

export function closingProgress(items: ClosingItem[]) {
  return checklistProgress(items);
}
