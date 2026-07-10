CREATE TABLE "CompanyRole" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false, "permissions" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyRole_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyRole_companyId_idx" ON "CompanyRole"("companyId");
ALTER TABLE "CompanyRole" ADD CONSTRAINT "CompanyRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT;
ALTER TABLE "Phase" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
UPDATE "Phase" SET "sortOrder" = "number";
