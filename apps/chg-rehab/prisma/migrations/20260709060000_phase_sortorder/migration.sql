ALTER TABLE "Phase" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
UPDATE "Phase" SET "sortOrder" = "number";
