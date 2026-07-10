CREATE TYPE "IssueType" AS ENUM ('Issue', 'Question');
CREATE TYPE "IssueStatus" AS ENUM ('Open', 'InProgress', 'Resolved');
CREATE TYPE "PunchStatus" AS ENUM ('Open', 'Done');
CREATE TABLE "DailyLog" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "logDate" DATE NOT NULL,
  "weather" TEXT, "crewCount" INTEGER, "workPerformed" TEXT NOT NULL, "notes" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DailyLog_projectId_idx" ON "DailyLog"("projectId");
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Issue" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "phaseId" TEXT,
  "type" "IssueType" NOT NULL DEFAULT 'Issue', "title" TEXT NOT NULL, "description" TEXT,
  "status" "IssueStatus" NOT NULL DEFAULT 'Open', "assigneeId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Issue_projectId_idx" ON "Issue"("projectId");
CREATE INDEX "Issue_phaseId_idx" ON "Issue"("phaseId");
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "PunchItem" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "phaseId" TEXT, "title" TEXT NOT NULL,
  "location" TEXT, "status" "PunchStatus" NOT NULL DEFAULT 'Open', "assigneeId" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "doneAt" TIMESTAMP(3),
  CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PunchItem_projectId_idx" ON "PunchItem"("projectId");
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "Photo" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "phaseId" TEXT, "docId" TEXT, "caption" TEXT,
  "dailyLogId" TEXT, "issueId" TEXT, "punchItemId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Photo_projectId_idx" ON "Photo"("projectId");
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
