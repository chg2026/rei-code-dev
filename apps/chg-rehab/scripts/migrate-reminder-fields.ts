/**
 * Adds the rebuilt-reminder columns to "WsReminder".
 * Idempotent: uses ADD COLUMN IF NOT EXISTS. Run with:
 *   node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-reminder-fields.ts
 *
 * We use raw SQL (not `prisma db push`) because db push trips on the
 * cross-schema public.account_products -> auth.users FK in this database.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const statements = [
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "dueDate" TEXT;`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "dueTime" TEXT;`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "urgency" TEXT;`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "dismissed" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "WsReminder" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);`,
    `CREATE INDEX IF NOT EXISTS "WsReminder_companyId_dismissed_dueDate_idx" ON "WsReminder" ("companyId", "dismissed", "dueDate");`,
  ];
  for (const sql of statements) {
    process.stdout.write(`-> ${sql}\n`);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("WsReminder migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
