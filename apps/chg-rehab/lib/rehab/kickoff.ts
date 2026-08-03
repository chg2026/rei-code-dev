import type { Prisma } from "@prisma/client";
import {
  type MetaChecklistItem,
  parseMetaChecklist,
  normalizeMetaChecklist,
  checklistProgress,
} from "@/lib/metaChecklist";

/**
 * Project Kickoff Checklist (CON-01). Post-acquisition control items a PM
 * confirms before real construction begins. Stored in project.meta.kickoff via
 * the shared meta-checklist primitive (no schema migration; fully editable).
 */
export const KICKOFF_META_KEY = "kickoff";

export const DEFAULT_KICKOFF_ITEMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "keys-collected", label: "Keys collected / property re-keyed" },
  { id: "safe-access", label: "Safe access confirmed (entry method documented)" },
  { id: "occupancy", label: "Occupancy confirmed (vacant / occupied / eviction decision)" },
  { id: "insurance", label: "Property insurance active" },
  { id: "utility-electric", label: "Electric on / service confirmed" },
  { id: "utility-water", label: "Water on / service confirmed" },
  { id: "utility-gas", label: "Gas on / service confirmed" },
  { id: "known-violations", label: "Known violations / open permits checked" },
  { id: "initial-photos", label: "Initial condition photos captured" },
  { id: "acquisition-docs", label: "Closing / insurance / payment docs uploaded" },
];

export type KickoffItem = MetaChecklistItem;

export function parseKickoff(rawMeta: Prisma.JsonValue | null | undefined) {
  return parseMetaChecklist(rawMeta, KICKOFF_META_KEY, DEFAULT_KICKOFF_ITEMS);
}

export function normalizeKickoffItems(raw: unknown, actorId: string, now?: Date) {
  return normalizeMetaChecklist(raw, actorId, now);
}

export function kickoffProgress(items: KickoffItem[]) {
  return checklistProgress(items);
}
