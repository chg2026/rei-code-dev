ALTER TABLE "Project" ADD COLUMN "arv" DECIMAL(14,2);
ALTER TABLE "Project" ADD COLUMN "acquisitionCost" DECIMAL(14,2);
ALTER TABLE "Project" ADD COLUMN "refiLtvPct" DECIMAL(5,2);
ALTER TABLE "Project" ADD COLUMN "refiRatePct" DECIMAL(5,2);
ALTER TABLE "Project" ADD COLUMN "refiTermYears" INTEGER;
ALTER TABLE "Project" ADD COLUMN "monthlyRent" DECIMAL(14,2);
ALTER TABLE "Project" ADD COLUMN "monthlyExpenses" DECIMAL(14,2);
CREATE TABLE "Estimate" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "propertyId" TEXT, "title" TEXT NOT NULL,
  "rehabType" TEXT, "sqft" INTEGER, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'Draft',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Estimate_companyId_idx" ON "Estimate"("companyId");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "EstimateLine" (
  "id" TEXT NOT NULL, "estimateId" TEXT NOT NULL, "costCode" INTEGER, "name" TEXT NOT NULL,
  "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0, "materialCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unit" TEXT, "unitPrice" DECIMAL(14,2), "quantity" DECIMAL(14,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EstimateLine_estimateId_idx" ON "EstimateLine"("estimateId");
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
