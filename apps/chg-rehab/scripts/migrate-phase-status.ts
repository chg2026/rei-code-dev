/**
 * Idempotent DDL: expand the chg-rehab "PhaseStatus" enum.
 *
 * The original enum had four values (NotStarted, Active, Complete, OnHold).
 * This migration replaces it with the richer operational set:
 *
 *   NotStarted, InProgress, Stuck, ReadyForReview, PendingInspection,
 *   WaitingOnMaterials, Delayed, OnHold, Done, Canceled
 *
 * Existing rows are remapped: Active -> InProgress, Complete -> Done.
 * NotStarted and OnHold are preserved verbatim.
 *
 * We apply this with raw SQL through the Prisma client because `prisma db
 * push` fails on this database (a cross-schema FK between
 * public.account_products and auth.users aborts the push). Run:
 *
 *   tsx apps/chg-rehab/scripts/migrate-phase-status.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 *
 * The enum is recreated atomically inside a transaction and the whole thing
 * is guarded so re-running is a no-op once the new values are in place.
 *
 * It also defensively drops any legacy UNIQUE on Project.propertyId so a
 * property can host multiple rehab projects (the current schema never
 * declared one, but older databases might).
 */
import { PrismaClient } from "@prisma/client";

const NEW_VALUES = [
  "NotStarted",
  "InProgress",
  "Stuck",
  "ReadyForReview",
  "PendingInspection",
  "WaitingOnMaterials",
  "Delayed",
  "OnHold",
  "Done",
  "Canceled",
] as const;

async function main() {
  const prisma = new PrismaClient();
  try {
    const labels = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'PhaseStatus'`
    );
    const current = new Set(labels.map((r) => r.enumlabel));
    const desired = new Set<string>(NEW_VALUES);
    const alreadyMigrated =
      current.size === desired.size && [...desired].every((v) => current.has(v));

    if (alreadyMigrated) {
      console.log("[migrate-phase-status] enum already up to date — skipping.");
    } else {
      const enumList = NEW_VALUES.map((v) => `'${v}'`).join(", ");
      const statements = [
        `DROP TYPE IF EXISTS "PhaseStatus_old"`,
        `ALTER TYPE "PhaseStatus" RENAME TO "PhaseStatus_old"`,
        `CREATE TYPE "PhaseStatus" AS ENUM (${enumList})`,
        `ALTER TABLE "Phase" ALTER COLUMN "status" DROP DEFAULT`,
        `ALTER TABLE "Phase" ALTER COLUMN "status" TYPE "PhaseStatus" USING (
           CASE "status"::text
             WHEN 'Active' THEN 'InProgress'
             WHEN 'Complete' THEN 'Done'
             ELSE "status"::text
           END::"PhaseStatus"
         )`,
        `ALTER TABLE "Phase" ALTER COLUMN "status" SET DEFAULT 'NotStarted'`,
        `DROP TYPE "PhaseStatus_old"`,
      ];
      await prisma.$transaction(statements.map((sql) => prisma.$executeRawUnsafe(sql)));
      console.log("[migrate-phase-status] PhaseStatus enum expanded and rows remapped.");
    }

    // Allow multiple projects per property: drop any legacy unique constraint
    // / index on Project.propertyId. Idempotent — no-op when absent.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_propertyId_key"`
    );
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Project_propertyId_key"`);
    console.log("[migrate-phase-status] ensured Project.propertyId is not unique.");

    console.log("[migrate-phase-status] done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[migrate-phase-status] failed:", err);
  process.exit(1);
});
