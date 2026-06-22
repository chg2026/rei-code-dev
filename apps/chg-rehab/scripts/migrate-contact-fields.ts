/**
 * Adds the "website" and "title" columns to "Contact".
 * Idempotent: uses ADD COLUMN IF NOT EXISTS. Run with:
 *   node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-contact-fields.ts
 *
 * We use raw SQL (not `prisma db push`) because db push trips on the
 * cross-schema public.account_products -> auth.users FK in this database.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const statements = [
    `ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "website" TEXT;`,
    `ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "title" TEXT;`,
  ];
  for (const sql of statements) {
    process.stdout.write(`-> ${sql}\n`);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("Contact fields migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
