import type { Prisma } from "@prisma/client";

/**
 * Shared "meta checklist" primitive. Both the project Kickoff checklist
 * (project.meta.kickoff) and the property Closing checklist
 * (property.meta.closing) are the same shape: an ordered array of toggleable
 * items with completion provenance, stored in a JSON `meta` cell so no schema
 * migration is required. This module centralises the defensive read/write so
 * every checklist behaves identically.
 */

export type MetaChecklistItem = {
  /** Stable id — never reused. */
  id: string;
  label: string;
  done: boolean;
  doneById: string | null;
  doneAt: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Build a fresh default list (all items un-done). */
export function makeDefaultChecklist(
  defaults: ReadonlyArray<{ id: string; label: string }>
): MetaChecklistItem[] {
  return defaults.map((d) => ({
    id: d.id,
    label: d.label,
    done: false,
    doneById: null,
    doneAt: null,
  }));
}

/**
 * Read a checklist out of a meta JSON value at `key`, defensively. Returns the
 * seeded defaults when absent or malformed (seeded=true so a GET can avoid a
 * write). A present-but-empty array is a legitimate state (seeded=false).
 */
export function parseMetaChecklist(
  rawMeta: Prisma.JsonValue | null | undefined,
  key: string,
  defaults: ReadonlyArray<{ id: string; label: string }>
): { items: MetaChecklistItem[]; seeded: boolean } {
  if (!isRecord(rawMeta)) return { items: makeDefaultChecklist(defaults), seeded: true };
  const raw = rawMeta[key];
  if (!Array.isArray(raw)) return { items: makeDefaultChecklist(defaults), seeded: true };

  const items: MetaChecklistItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      label,
      done: entry.done === true,
      doneById: typeof entry.doneById === "string" ? entry.doneById : null,
      doneAt: typeof entry.doneAt === "string" ? entry.doneAt : null,
    });
  }
  return { items, seeded: false };
}

/**
 * Validate + normalise an incoming items array (PATCH body) into the canonical
 * shape: drops malformed rows, de-dupes ids, clamps lengths, and stamps
 * completion provenance. Returns null when the payload isn't an array (400).
 */
export function normalizeMetaChecklist(
  raw: unknown,
  actorId: string,
  now: Date = new Date()
): MetaChecklistItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MetaChecklistItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : null;
    const label =
      typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 200) : null;
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const done = entry.done === true;
    const doneById = done
      ? typeof entry.doneById === "string" && entry.doneById
        ? entry.doneById
        : actorId
      : null;
    const doneAt = done
      ? typeof entry.doneAt === "string" && entry.doneAt
        ? entry.doneAt
        : now.toISOString()
      : null;
    out.push({ id, label, done, doneById, doneAt });
  }
  return out;
}

export function checklistProgress(items: MetaChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
