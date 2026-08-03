import type { Prisma } from "@prisma/client";

/**
 * Project Kickoff Checklist (CON-01). Post-acquisition control items a PM
 * confirms before real construction begins: keys, insurance, utilities,
 * occupancy, safe access, and initial documentation.
 *
 * Stored in `project.meta.kickoff` as an array of items — there is no dedicated
 * table (deploy uses `prisma db push`; JSON keeps this migration-free and
 * fully editable). Each item carries a stable `id` so toggles/removals target
 * the right row even after the list is reordered or edited.
 */
export type KickoffItem = {
  /** Stable id (cuid-like or slug). Never reused. */
  id: string;
  label: string;
  done: boolean;
  /** User id that last marked it done, if any. */
  doneById: string | null;
  /** ISO timestamp it was last marked done, if any. */
  doneAt: string | null;
};

/**
 * Default checklist seeded on first view. Editable by the PM afterwards
 * (add / remove / toggle) — these are only the starting items.
 */
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

function makeDefaults(): KickoffItem[] {
  return DEFAULT_KICKOFF_ITEMS.map((d) => ({
    id: d.id,
    label: d.label,
    done: false,
    doneById: null,
    doneAt: null,
  }));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Read the kickoff checklist out of a project.meta JSON value defensively.
 * Returns the seeded defaults when absent or malformed. `seeded` is true when
 * the caller is looking at defaults (nothing persisted yet) so a GET can avoid
 * a write while still returning a usable list.
 */
export function parseKickoff(
  rawMeta: Prisma.JsonValue | null | undefined
): { items: KickoffItem[]; seeded: boolean } {
  if (!isRecord(rawMeta)) return { items: makeDefaults(), seeded: true };
  const raw = rawMeta.kickoff;
  if (!Array.isArray(raw)) return { items: makeDefaults(), seeded: true };

  const items: KickoffItem[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
    if (!id || !label || seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({
      id,
      label,
      done: entry.done === true,
      doneById: typeof entry.doneById === "string" ? entry.doneById : null,
      doneAt: typeof entry.doneAt === "string" ? entry.doneAt : null,
    });
  }
  // An empty-but-present array is a legitimate state (PM removed every item).
  return { items, seeded: false };
}

/**
 * Validate + normalise an incoming items array (from a PATCH body) into the
 * canonical KickoffItem[] shape. Rejects non-arrays, drops malformed rows,
 * de-dupes ids, and clamps label length. Returns null when the payload is not
 * an array at all (caller should 400).
 */
export function normalizeKickoffItems(
  raw: unknown,
  actorId: string,
  now: Date = new Date()
): KickoffItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: KickoffItem[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : null;
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim().slice(0, 200)
        : null;
    if (!id || !label || seenIds.has(id)) continue;
    seenIds.add(id);
    const done = entry.done === true;
    // Preserve a provided completion stamp; otherwise stamp the actor/time when
    // an item arrives already marked done without provenance.
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

/** Count complete / total for a progress indicator. */
export function kickoffProgress(items: KickoffItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
