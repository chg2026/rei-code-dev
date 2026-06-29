-- Task-management overhaul: status enum, private flag, multi-assignee junction.
-- Idempotent. Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f this file
-- DATABASE_URL points at Supabase; do NOT use `prisma db push` (cross-schema FK
-- on public.account_products -> auth.users makes push fail). Run `prisma generate`
-- after applying this file.

-- 1b: status enum + column (keep legacy `done` boolean in sync from app code)
DO $$ BEGIN
  CREATE TYPE "WsTaskStatus" AS ENUM ('NotStarted','InProgress','InReview','Done','Cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "WsTask" ADD COLUMN IF NOT EXISTS "status" "WsTaskStatus" NOT NULL DEFAULT 'NotStarted';

-- 1c: private "My Workspace" tasks
ALTER TABLE "WsTask" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing completed tasks should read as Done (only touch rows still
-- at the default so we never clobber a status set later).
UPDATE "WsTask" SET "status" = 'Done' WHERE "done" = true AND "status" = 'NotStarted';

-- 1a: multi-assignee junction
CREATE TABLE IF NOT EXISTS "WsTaskAssignee" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "WsTaskAssignee" ADD CONSTRAINT "WsTaskAssignee_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "WsTask"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WsTaskAssignee" ADD CONSTRAINT "WsTaskAssignee_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WsTaskAssignee"
    ADD CONSTRAINT "WsTaskAssignee_taskId_userId_key" UNIQUE ("taskId","userId");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "WsTaskAssignee_userId_idx" ON "WsTaskAssignee"("userId");

-- Backfill junction from the legacy single assigneeId so existing tasks keep
-- their assignee under the new model.
INSERT INTO "WsTaskAssignee" ("id","taskId","userId","assignedAt")
SELECT gen_random_uuid()::text, t."id", t."assigneeId", now()
FROM "WsTask" t
WHERE t."assigneeId" IS NOT NULL
ON CONFLICT ("taskId","userId") DO NOTHING;
