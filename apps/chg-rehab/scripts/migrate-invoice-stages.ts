/**
 * Idempotent DDL: introduce the "InvoiceStage" table so an invoice can carry a
 * milestone-based payment schedule (e.g. 50% on completion, 25% on inspection,
 * 25% final).
 *
 * We apply this with raw SQL through the Prisma client because `prisma db push`
 * fails on this database (a cross-schema FK between public.account_products and
 * auth.users aborts the push). Run:
 *
 *   ./node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-invoice-stages.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * Re-running is a no-op once the table exists.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InvoiceStage" (
        "id"           TEXT NOT NULL,
        "invoiceId"    TEXT NOT NULL,
        "name"         TEXT NOT NULL,
        "description"  TEXT,
        "percentage"   DECIMAL(5,2),
        "amount"       DECIMAL(14,2) NOT NULL,
        "status"       TEXT NOT NULL DEFAULT 'Pending',
        "triggerEvent" TEXT,
        "dueDate"      DATE,
        "paidAt"       TIMESTAMP(3),
        "order"        INTEGER NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InvoiceStage_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "InvoiceStage_invoiceId_idx" ON "InvoiceStage"("invoiceId")`
    );
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
           WHERE constraint_name = 'InvoiceStage_invoiceId_fkey'
             AND table_name = 'InvoiceStage'
        ) THEN
          ALTER TABLE "InvoiceStage"
            ADD CONSTRAINT "InvoiceStage_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
    console.log("InvoiceStage migration applied (idempotent).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
