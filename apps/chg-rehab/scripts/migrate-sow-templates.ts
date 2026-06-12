/**
 * Idempotent DDL: create the user-manageable SOW template tables.
 *
 * `SowTemplate` / `SowTemplatePhase` live in the chg-rehab Prisma database
 * (DATABASE_URL → Replit Postgres), NOT Supabase. We apply the DDL with raw SQL
 * through the Prisma client because `prisma db push` fails on this database (a
 * cross-schema FK between public.account_products and auth.users aborts the
 * push). Run:
 *
 *   tsx apps/chg-rehab/scripts/migrate-sow-templates.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * Both CREATEs are `IF NOT EXISTS`, so re-running is safe.
 */
import { PrismaClient } from "@prisma/client";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "SowTemplate" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "companyId" TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "SowTemplate_companyId_idx" ON "SowTemplate"("companyId")`,
  `CREATE TABLE IF NOT EXISTS "SowTemplatePhase" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "templateId" TEXT NOT NULL REFERENCES "SowTemplate"(id) ON DELETE CASCADE,
    number INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    "laborBudget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "materialsBudget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    dependencies INT[] NOT NULL DEFAULT '{}',
    "acceptanceCriteria" TEXT[] NOT NULL DEFAULT '{}',
    UNIQUE("templateId", number)
  )`,
  `CREATE INDEX IF NOT EXISTS "SowTemplatePhase_templateId_idx" ON "SowTemplatePhase"("templateId")`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
      console.log("[migrate-sow-templates] ok:", sql.split("\n")[0]);
    }
    console.log("[migrate-sow-templates] done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[migrate-sow-templates] failed:", err);
  process.exit(1);
});
