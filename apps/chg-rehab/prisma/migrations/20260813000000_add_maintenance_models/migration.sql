warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('Emergency', 'High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "MaintenanceReportStatus" AS ENUM ('New', 'Reviewed', 'Converted', 'Declined');

-- CreateEnum
CREATE TYPE "MaintenanceAgreementStatus" AS ENUM ('Active', 'Paused', 'Ended');

-- CreateEnum
CREATE TYPE "MaintenanceVisitStatus" AS ENUM ('Scheduled', 'InProgress', 'Completed');

-- CreateTable
CREATE TABLE "MaintenanceAgreement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "retainerAmount" DECIMAL(14,2) NOT NULL,
    "tripsPerMonth" INTEGER NOT NULL DEFAULT 3,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "MaintenanceAgreementStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reportedBy" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'Medium',
    "status" "MaintenanceReportStatus" NOT NULL DEFAULT 'New',
    "convertedToVisitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceVisit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reportId" TEXT,
    "visitedAt" DATE NOT NULL,
    "tripNumber" INTEGER NOT NULL,
    "description" TEXT,
    "status" "MaintenanceVisitStatus" NOT NULL DEFAULT 'Scheduled',
    "laborCostTotal" DECIMAL(14,2),
    "materialCostTotal" DECIMAL(14,2),
    "isRepeatFix" BOOLEAN NOT NULL DEFAULT false,
    "photos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWorkItem" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Repair',
    "laborCost" DECIMAL(14,2),
    "materialCost" DECIMAL(14,2),
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceAgreement_companyId_idx" ON "MaintenanceAgreement"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceAgreement_contactId_idx" ON "MaintenanceAgreement"("contactId");

-- CreateIndex
CREATE INDEX "MaintenanceReport_companyId_idx" ON "MaintenanceReport"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceReport_propertyId_idx" ON "MaintenanceReport"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceReport_status_idx" ON "MaintenanceReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceVisit_reportId_key" ON "MaintenanceVisit"("reportId");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_companyId_idx" ON "MaintenanceVisit"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_propertyId_idx" ON "MaintenanceVisit"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_agreementId_idx" ON "MaintenanceVisit"("agreementId");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_contactId_idx" ON "MaintenanceVisit"("contactId");

-- CreateIndex
CREATE INDEX "MaintenanceWorkItem_visitId_idx" ON "MaintenanceWorkItem"("visitId");

-- CreateIndex
CREATE INDEX "MaintenancePayment_companyId_idx" ON "MaintenancePayment"("companyId");

-- CreateIndex
CREATE INDEX "MaintenancePayment_agreementId_idx" ON "MaintenancePayment"("agreementId");

-- AddForeignKey
ALTER TABLE "MaintenanceAgreement" ADD CONSTRAINT "MaintenanceAgreement_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceReport" ADD CONSTRAINT "MaintenanceReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceReport" ADD CONSTRAINT "MaintenanceReport_convertedToVisitId_fkey" FOREIGN KEY ("convertedToVisitId") REFERENCES "MaintenanceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "MaintenanceAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MaintenanceReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkItem" ADD CONSTRAINT "MaintenanceWorkItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "MaintenanceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePayment" ADD CONSTRAINT "MaintenancePayment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "MaintenanceAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

