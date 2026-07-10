ALTER TABLE "ChangeOrder" ADD COLUMN "daysDelta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "contingency" DECIMAL(14,2) NOT NULL DEFAULT 0;
CREATE TYPE "CommitmentType" AS ENUM ('Subcontract', 'PurchaseOrder');
CREATE TYPE "CommitmentStatus" AS ENUM ('Draft', 'Approved', 'Complete');
CREATE TABLE "Commitment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phaseId" TEXT,
  "contractorId" TEXT,
  "type" "CommitmentType" NOT NULL DEFAULT 'Subcontract',
  "title" TEXT NOT NULL,
  "status" "CommitmentStatus" NOT NULL DEFAULT 'Draft',
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Commitment_projectId_idx" ON "Commitment"("projectId");
CREATE INDEX "Commitment_phaseId_idx" ON "Commitment"("phaseId");
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
