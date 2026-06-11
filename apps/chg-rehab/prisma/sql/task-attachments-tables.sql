-- WsTaskAttachment / PmTaskAttachment: file attachments on workspace + PM tasks.
-- Idempotent: safe to re-run. Applied with `prisma db execute` because
-- `prisma db push` fails on a pre-existing cross-schema FK (see
-- .agents/memory/prisma-supabase-cross-schema.md).

CREATE TABLE IF NOT EXISTS "WsTaskAttachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WsTaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WsTaskAttachment_taskId_idx" ON "WsTaskAttachment" ("taskId");

CREATE TABLE IF NOT EXISTS "PmTaskAttachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PmTaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PmTaskAttachment_taskId_idx" ON "PmTaskAttachment" ("taskId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskAttachment_taskId_fkey') THEN
    ALTER TABLE "WsTaskAttachment"
      ADD CONSTRAINT "WsTaskAttachment_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "WsTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskAttachment_uploadedById_fkey') THEN
    ALTER TABLE "WsTaskAttachment"
      ADD CONSTRAINT "WsTaskAttachment_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PmTaskAttachment_taskId_fkey') THEN
    ALTER TABLE "PmTaskAttachment"
      ADD CONSTRAINT "PmTaskAttachment_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PmTaskAttachment_uploadedById_fkey') THEN
    ALTER TABLE "PmTaskAttachment"
      ADD CONSTRAINT "PmTaskAttachment_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
