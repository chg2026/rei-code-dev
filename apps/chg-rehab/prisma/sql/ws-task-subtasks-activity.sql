-- WsTask subtasks (self-relation) + WsTaskActivity (per-task activity feed).
-- Idempotent: safe to re-run. Applied with `prisma db execute` because
-- `prisma db push` fails on a pre-existing cross-schema FK (see
-- .agents/memory/prisma-supabase-cross-schema.md).

-- 1. Subtasks: self-referencing parentTaskId on WsTask.
ALTER TABLE "WsTask" ADD COLUMN IF NOT EXISTS "parentTaskId" TEXT;

CREATE INDEX IF NOT EXISTS "WsTask_parentTaskId_idx" ON "WsTask" ("parentTaskId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTask_parentTaskId_fkey') THEN
    ALTER TABLE "WsTask"
      ADD CONSTRAINT "WsTask_parentTaskId_fkey"
      FOREIGN KEY ("parentTaskId") REFERENCES "WsTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Per-task activity feed.
CREATE TABLE IF NOT EXISTS "WsTaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WsTaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WsTaskActivity_taskId_idx" ON "WsTaskActivity" ("taskId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskActivity_taskId_fkey') THEN
    ALTER TABLE "WsTaskActivity"
      ADD CONSTRAINT "WsTaskActivity_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "WsTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTaskActivity_userId_fkey') THEN
    ALTER TABLE "WsTaskActivity"
      ADD CONSTRAINT "WsTaskActivity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
