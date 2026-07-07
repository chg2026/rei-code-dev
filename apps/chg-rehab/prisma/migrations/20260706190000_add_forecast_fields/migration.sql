-- CreateEnum
CREATE TYPE "ForecastMethod" AS ENUM ('Auto', 'Manual', 'PercentComplete');

-- AlterTable
ALTER TABLE "Phase" ADD COLUMN "percentComplete" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "forecastMethod" "ForecastMethod" NOT NULL DEFAULT 'Auto',
ADD COLUMN "forecastManual" DECIMAL(14,2);
