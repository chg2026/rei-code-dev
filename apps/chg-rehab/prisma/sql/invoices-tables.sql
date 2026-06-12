-- Rehab Manager — Invoices tab.
-- Idempotent. Applied against DATABASE_URL (Replit Postgres, the chg-rehab
-- Prisma datasource where the Project table lives) via:
--   ./node_modules/.bin/prisma db execute \
--     --schema=apps/chg-rehab/prisma/schema.prisma \
--     --file=apps/chg-rehab/prisma/sql/invoices-tables.sql
-- NOTE: Invoice.projectId FKs Project(id), so this must run on the same
-- database as Project (Replit Postgres), NOT Supabase.

DO $$ BEGIN
  CREATE TYPE "InvoiceClassification" AS ENUM ('Labor', 'Materials', 'Permit', 'Dumpster', 'Utility', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('Unpaid', 'Pending', 'Paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Invoice" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "phaseId" TEXT,
  vendor TEXT NOT NULL,
  "invoiceNumber" TEXT,
  date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  classification "InvoiceClassification" NOT NULL DEFAULT 'Other',
  status "InvoiceStatus" NOT NULL DEFAULT 'Unpaid',
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx" ON "Invoice"("projectId");

CREATE TABLE IF NOT EXISTS "InvoiceAttachment" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "InvoiceAttachment_invoiceId_idx" ON "InvoiceAttachment"("invoiceId");
