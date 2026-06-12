/**
 * Idempotent DDL: introduce the "InvoiceJobType" table so a single invoice can
 * be split across multiple job types (formerly "phases").
 *
 * Previously an Invoice referenced at most one phase via Invoice."phaseId".
 * This migration:
 *   1. Creates "InvoiceJobType" (id, invoiceId FK CASCADE, phaseId, amount,
 *      notes, createdAt).
 *   2. Backfills one InvoiceJobType row per existing invoice that has a
 *      non-null phaseId (amount = the invoice's amount).
 *   3. Drops Invoice."phaseId".
 *
 * We apply this with raw SQL through the Prisma client because `prisma db
 * push` fails on this database (a cross-schema FK between
 * public.account_products and auth.users aborts the push). Run:
 *
 *   tsx apps/chg-rehab/scripts/migrate-invoice-jobtypes.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * Re-running is a no-op once the table exists and the column is dropped.
 */
import { PrismaClient } from "@prisma/client";

async function columnExists(prisma: PrismaClient, table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column
  );
  return rows[0]?.exists === true;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InvoiceJobType" (
        "id"        TEXT NOT NULL,
        "invoiceId" TEXT NOT NULL,
        "phaseId"   TEXT,
        "amount"    DECIMAL(14,2) NOT NULL,
        "notes"     TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InvoiceJobType_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "InvoiceJobType_invoiceId_idx" ON "InvoiceJobType"("invoiceId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "InvoiceJobType_phaseId_idx" ON "InvoiceJobType"("phaseId")`
    );
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
           WHERE constraint_name = 'InvoiceJobType_invoiceId_fkey'
        ) THEN
          ALTER TABLE "InvoiceJobType"
            ADD CONSTRAINT "InvoiceJobType_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("[migrate-invoice-jobtypes] InvoiceJobType table ensured.");

    // Backfill from the legacy Invoice.phaseId column (only while it still exists).
    if (await columnExists(prisma, "Invoice", "phaseId")) {
      const inserted = await prisma.$executeRawUnsafe(`
        INSERT INTO "InvoiceJobType" ("id", "invoiceId", "phaseId", "amount", "notes", "createdAt")
        SELECT gen_random_uuid()::text, i."id", i."phaseId", i."amount", NULL, i."createdAt"
          FROM "Invoice" i
         WHERE i."phaseId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "InvoiceJobType" jt WHERE jt."invoiceId" = i."id"
           )
      `);
      console.log(`[migrate-invoice-jobtypes] backfilled ${inserted} job-type row(s).`);

      await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "phaseId"`);
      console.log('[migrate-invoice-jobtypes] dropped Invoice."phaseId".');
    } else {
      console.log("[migrate-invoice-jobtypes] Invoice.phaseId already dropped — skipping backfill.");
    }

    console.log("[migrate-invoice-jobtypes] done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[migrate-invoice-jobtypes] failed:", err);
  process.exit(1);
});
