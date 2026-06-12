import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { FULL_GUT_REHAB, TURNOVER_REHAB, type SowTemplate } from "./sow-templates";

/**
 * Ensure a company has its starter SOW templates. On the first call for a
 * company (when it has zero templates) this creates the two standard
 * templates — "Full Gut Rehab" and "Turnover Rehab" — as fully editable,
 * database-backed records. Idempotent and concurrency-safe: a transaction
 * advisory lock keyed by company serializes concurrent first-load requests so
 * defaults are seeded exactly once.
 */
export async function ensureDefaultTemplates(companyId: string, userId: string) {
  // Fast path — avoid a transaction/lock once seeding has happened.
  const count = await prisma.sowTemplate.count({ where: { companyId } });
  if (count > 0) return;

  const defaults: SowTemplate[] = [FULL_GUT_REHAB, TURNOVER_REHAB];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      `sow-templates:${companyId}`
    );

    // Re-check inside the lock: another request may have seeded already.
    const inner = await tx.sowTemplate.count({ where: { companyId } });
    if (inner > 0) return;

    for (const tpl of defaults) {
      await tx.sowTemplate.create({
        data: {
          companyId,
          name: tpl.label,
          description: tpl.description,
          createdById: userId,
          phases: {
            create: tpl.phases.map((p, idx) => ({
              number: idx + 1,
              name: p.name,
              laborBudget: new Prisma.Decimal(p.laborBudget ?? 0),
              materialsBudget: new Prisma.Decimal(p.materialsBudget ?? 0),
              dependencies: p.dependencies,
              acceptanceCriteria: p.acceptanceCriteria,
            })),
          },
        },
      });
    }
  });
}
