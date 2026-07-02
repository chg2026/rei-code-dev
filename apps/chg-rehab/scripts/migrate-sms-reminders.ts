/**
 * Apply prisma/migrations/20260702163353_add_sms_reminders/migration.sql:
 * adds phone/timezone columns to "User" and creates the "WsReminderSms" table
 * (per-reminder scheduled SMS rows) with its indexes and foreign keys.
 *
 * We apply this with raw SQL through the Prisma client because `prisma db push`
 * and `prisma migrate dev` fail on this database (a cross-schema FK between
 * public.account_products and auth.users aborts introspection). The SQL is read
 * from the generated migration file and executed as written, wrapped in a
 * single transaction (Postgres DDL is transactional) so it is all-or-nothing.
 * Run:
 *
 *   ./node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-sms-reminders.ts
 *   ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const MIGRATION_FILE = join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20260702163353_add_sms_reminders",
  "migration.sql"
);

async function main() {
  const sql = readFileSync(MIGRATION_FILE, "utf8");
  // Split into individual statements (Prisma raw queries accept one statement
  // per call). The file contains plain DDL only — no DO blocks or functions —
  // so splitting on ";" is safe. The SQL text itself is not modified.
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const stmt of statements) {
          await tx.$executeRawUnsafe(stmt);
        }
      },
      { timeout: 60_000 }
    );
    console.log(
      `add_sms_reminders migration applied: ${statements.length} statements in one transaction.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
