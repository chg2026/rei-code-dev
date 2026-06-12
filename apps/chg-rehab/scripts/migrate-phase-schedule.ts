/**
 * Idempotent DDL: add scheduling columns to the chg-rehab "Phase" table.
 *
 * These columns are the basis for the Gantt view:
 *   - plannedStartDate : the planned start of the phase (date only)
 *   - estimatedDays    : planned duration in days
 *   - plannedEndDate   : computed (plannedStartDate + estimatedDays) and saved
 *                        by the API. Stored as a PLAIN column (not a Postgres
 *                        GENERATED column) so Prisma can treat it as an ordinary
 *                        nullable field without write conflicts.
 *
 * We apply the DDL with raw SQL through the Prisma client because
 * `prisma db push` fails on this database (a cross-schema FK between
 * public.account_products and auth.users aborts the push). Run:
 *
 *   tsx apps/chg-rehab/scripts/migrate-phase-schedule.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * Every ALTER is `IF NOT EXISTS`, so re-running is safe.
 */
import { PrismaClient } from "@prisma/client";

const STATEMENTS = [
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "plannedStartDate" DATE`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "estimatedDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "plannedEndDate" DATE`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
      console.log("[migrate-phase-schedule] ok:", sql);
    }
    console.log("[migrate-phase-schedule] done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[migrate-phase-schedule] failed:", err);
  process.exit(1);
});
