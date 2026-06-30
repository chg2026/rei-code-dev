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

export type ParsedStage = {
  id: string | null;
  name: string;
  description: string | null;
  percentage: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  status: string;
  triggerEvent: string | null;
  dueDate: Date | null;
  order: number;
};

/**
 * Validate the `stages` payload (milestone payment schedule). Each row carries a
 * name, an amount, optional percentage / trigger / due date, and a status
 * (Pending | Paid). When an `id` is present the caller should update that row,
 * otherwise create a new one. Returns the parsed rows or an error message.
 */
export function parseStages(
  raw: unknown
): { ok: true; rows: ParsedStage[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, rows: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "stages must be an array" };

  const rows: ParsedStage[] = [];
  let index = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid stage row" };
    }
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) return { ok: false, error: "Each payment stage needs a name" };

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(rec.amount as Prisma.Decimal.Value);
    } catch {
      return { ok: false, error: "Each payment stage needs a valid amount" };
    }

    let percentage: Prisma.Decimal | null = null;
    if (rec.percentage != null && rec.percentage !== "") {
      try {
        percentage = new Prisma.Decimal(rec.percentage as Prisma.Decimal.Value);
      } catch {
        return { ok: false, error: "Invalid percentage on a payment stage" };
      }
    }

    const status = rec.status === "Paid" ? "Paid" : "Pending";
    const description =
      typeof rec.description === "string" && rec.description.trim()
        ? rec.description.trim()
        : null;
    const triggerEvent =
      typeof rec.triggerEvent === "string" && rec.triggerEvent.trim()
        ? rec.triggerEvent.trim()
        : null;
    let dueDate: Date | null = null;
    if (rec.dueDate) {
      const d = new Date(rec.dueDate as string);
      if (!Number.isNaN(d.getTime())) dueDate = d;
    }
    const order = typeof rec.order === "number" ? rec.order : index;
    const id = typeof rec.id === "string" && rec.id ? rec.id : null;

    rows.push({ id, name, description, percentage, amount, status, triggerEvent, dueDate, order });
    index++;
  }
  return { ok: true, rows };
}
