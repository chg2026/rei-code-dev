-- Property Management: extend Lease + new RentPayment
-- Additive only. Run once against the shared Supabase database.
-- Preflight: confirm target database and backup/PITR before executing.

BEGIN;

-- ── Extend Lease ──────────────────────────────────────────────
-- Guard: only add column if absent (idempotent)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Lease'
      AND a.attname = 'tenantEmail'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE "Lease" ADD COLUMN "tenantEmail" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Lease'
      AND a.attname = 'tenantPhone'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE "Lease" ADD COLUMN "tenantPhone" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Lease'
      AND a.attname = 'securityDeposit'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE "Lease" ADD COLUMN "securityDeposit" DECIMAL(10,2);
  END IF;
END $$;

-- ── RentPayment table ─────────────────────────────────────────
-- Guard: only create if table absent

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'RentPayment'
      AND c.relkind = 'r'
  ) THEN
    CREATE TABLE "RentPayment" (
        "id"         TEXT NOT NULL,
        "companyId"  TEXT NOT NULL,
        "leaseId"    TEXT NOT NULL,
        "amount"     DECIMAL(10,2) NOT NULL,
        "period"     TEXT NOT NULL,
        "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "method"     TEXT,
        "notes"      TEXT,
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "RentPayment_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- ── RentPayment indexes ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'RentPayment_companyId_idx'
  ) THEN
    CREATE INDEX "RentPayment_companyId_idx" ON "RentPayment"("companyId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'RentPayment_leaseId_idx'
  ) THEN
    CREATE INDEX "RentPayment_leaseId_idx" ON "RentPayment"("leaseId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'RentPayment_leaseId_period_key'
  ) THEN
    CREATE UNIQUE INDEX "RentPayment_leaseId_period_key" ON "RentPayment"("leaseId", "period");
  END IF;
END $$;

-- ── RentPayment foreign keys ─────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND con.conname = 'RentPayment_companyId_fkey'
  ) THEN
    ALTER TABLE "RentPayment"
      ADD CONSTRAINT "RentPayment_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND con.conname = 'RentPayment_leaseId_fkey'
  ) THEN
    ALTER TABLE "RentPayment"
      ADD CONSTRAINT "RentPayment_leaseId_fkey"
      FOREIGN KEY ("leaseId") REFERENCES "Lease"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Post-check: verify the new columns, table, indexes, and FKs exist
SELECT
  (SELECT count(*) = 3
   FROM pg_attribute a
   JOIN pg_class c ON c.oid = a.attrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'Lease'
     AND a.attname IN ('tenantEmail', 'tenantPhone', 'securityDeposit')
     AND a.attnum > 0 AND NOT a.attisdropped) AS "lease_columns_ok",

  to_regclass('public."RentPayment"') IS NOT NULL AS "rentpayment_table_ok",

  (SELECT count(*) = 3
   FROM pg_index i
   JOIN pg_class c ON c.oid = i.indexrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('RentPayment_companyId_idx', 'RentPayment_leaseId_idx', 'RentPayment_leaseId_period_key')) AS "rentpayment_indexes_ok",

  (SELECT count(*) = 2
   FROM pg_constraint con
   JOIN pg_namespace n ON n.oid = con.connamespace
   WHERE n.nspname = 'public'
     AND con.conname IN ('RentPayment_companyId_fkey', 'RentPayment_leaseId_fkey')) AS "rentpayment_fks_ok";