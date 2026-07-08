-- Null out any orphaned phaseId references so the FK constraint can be added safely
UPDATE "InvoiceJobType" SET "phaseId" = NULL WHERE "phaseId" IS NOT NULL AND "phaseId" NOT IN (SELECT "id" FROM "Phase");

-- AddForeignKey
ALTER TABLE "InvoiceJobType" ADD CONSTRAINT "InvoiceJobType_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
