-- Rehab Manager — Change Orders tab.
-- Idempotent. Applied against DATABASE_URL (Replit Postgres, the chg-rehab
-- Prisma datasource where the Project table lives) via:
--   ./node_modules/.bin/prisma db execute \
--     --schema=apps/chg-rehab/prisma/schema.prisma \
--     --file=apps/chg-rehab/prisma/sql/change-orders-tables.sql
-- NOTE: ChangeOrder.projectId FKs Project(id), so this must run on the same
-- database as Project (Replit Postgres), NOT Supabase.

DO $$ BEGIN
  CREATE TYPE "ChangeOrderStatus" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ChangeOrder" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "phaseId" TEXT,
  number INT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  amount DECIMAL(14,2) NOT NULL,
  status "ChangeOrderStatus" NOT NULL DEFAULT 'Pending',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("projectId", number)
);
CREATE INDEX IF NOT EXISTS "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");
