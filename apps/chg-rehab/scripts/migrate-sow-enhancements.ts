/**
 * Idempotent DDL: add SOW-enhancement columns to the `Phase` table.
 *
 * The `Phase` table lives in the chg-rehab Prisma database (DATABASE_URL →
 * Replit Postgres), NOT Supabase. We apply the DDL with raw SQL through the
 * Prisma client because `prisma db push` fails on this database (a cross-schema
 * FK between public.account_products and auth.users aborts the push). Run:
 *
 *   tsx apps/chg-rehab/scripts/migrate-sow-enhancements.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * Each ALTER is `IF NOT EXISTS`, so re-running is safe.
 */
import { PrismaClient } from "@prisma/client";

const STATEMENTS = [
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "laborBudget" DECIMAL(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "materialsBudget" DECIMAL(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS dependencies INT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "acceptanceCriteria" TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "assignedContractorId" TEXT`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
      console.log("[migrate-sow-enhancements] ok:", sql);
    }
    console.log("[migrate-sow-enhancements] done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[migrate-sow-enhancements] failed:", err);
  process.exit(1);
});
