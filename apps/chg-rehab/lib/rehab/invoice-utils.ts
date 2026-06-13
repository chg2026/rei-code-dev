import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ParsedJobType = {
  phaseId: string | null;
  amount: Prisma.Decimal;
  notes: string | null;
};

/**
 * Validate the `jobTypes` payload. Each row carries an optional phase (job
 * type), a required amount, and optional notes. Phase ids must belong to the
 * project. Returns either the parsed rows or an error message.
 */
export async function parseJobTypes(
  raw: unknown,
  projectId: string
): Promise<{ ok: true; rows: ParsedJobType[] } | { ok: false; error: string }> {
  if (raw == null) return { ok: true, rows: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "jobTypes must be an array" };

  const validPhaseIds = new Set(
    (
      await prisma.phase.findMany({
        where: { projectId },
        select: { id: true },
      })
    ).map((p) => p.id)
  );

  const rows: ParsedJobType[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid job type row" };
    }
    const rec = item as Record<string, unknown>;
    let phaseId: string | null = null;
    if (typeof rec.phaseId === "string" && rec.phaseId) {
      if (!validPhaseIds.has(rec.phaseId)) {
        return { ok: false, error: "Invalid job type" };
      }
      phaseId = rec.phaseId;
    }
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(rec.amount as Prisma.Decimal.Value);
    } catch {
      return { ok: false, error: "A valid amount is required for each job type" };
    }
    const notes =
      typeof rec.notes === "string" && rec.notes.trim() ? rec.notes.trim() : null;
    rows.push({ phaseId, amount, notes });
  }
  return { ok: true, rows };
}
