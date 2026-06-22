/**
 * Adds the new values to the "ContactType" enum.
 * Idempotent: uses ADD VALUE IF NOT EXISTS. Run with:
 *   node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-contact-types.ts
 *
 * We use raw SQL (not `prisma db push`) because db push trips on the
 * cross-schema public.account_products -> auth.users FK in this database.
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so each
 * statement is executed standalone via $executeRawUnsafe (autocommit).
 */
import { prisma } from "../lib/prisma";

async function main() {
  const statements = [
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Investor';`,
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Lender';`,
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Agent';`,
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Attorney';`,
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Partner';`,
    `ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'Employee';`,
  ];
  for (const sql of statements) {
    process.stdout.write(`-> ${sql}\n`);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("ContactType enum migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
