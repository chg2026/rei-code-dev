-- WsTaskComment: comments on workspace (WsTask) tasks.
-- Idempotent: safe to re-run. Applied with `prisma db execute` because
-- `prisma db push` fails on a pre-existing cross-schema FK (see
-- .agents/memory/prisma-supabase-cross-schema.md).

CREATE TABLE IF NOT EXISTS "WsTaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WsTaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WsTaskComment_taskId_idx" ON "WsTaskComment" ("taskId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskComment_taskId_fkey') THEN
    ALTER TABLE "WsTaskComment"
      ADD CONSTRAINT "WsTaskComment_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "WsTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskComment_authorId_fkey') THEN
    ALTER TABLE "WsTaskComment"
      ADD CONSTRAINT "WsTaskComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
