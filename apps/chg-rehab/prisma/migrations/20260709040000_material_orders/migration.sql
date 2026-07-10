CREATE TYPE "MaterialStatus" AS ENUM ('Needed', 'Ordered', 'Shipped', 'Delivered', 'Delayed');
CREATE TABLE "MaterialOrder" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "phaseId" TEXT,
  "vendor" TEXT, "description" TEXT NOT NULL, "quantity" TEXT,
  "trackingNumber" TEXT, "eta" DATE, "status" "MaterialStatus" NOT NULL DEFAULT 'Needed',
  "urgent" BOOLEAN NOT NULL DEFAULT false, "cost" DECIMAL(14,2), "notes" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaterialOrder_projectId_idx" ON "MaterialOrder"("projectId");
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
