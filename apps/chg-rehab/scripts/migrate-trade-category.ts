/**
 * Creates the "TradeCategory" enum and adds the "tradeCategory" column to
 * "Contact". The legacy free-text "trade" column is intentionally kept for
 * now (data migration happens later). Idempotent. Run with:
 *   node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-trade-category.ts
 *
 * We use raw SQL (not `prisma db push`) because db push trips on the
 * cross-schema public.account_products -> auth.users FK in this database.
 * CREATE TYPE has no IF NOT EXISTS, so it is guarded with a DO block.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const createEnum = `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeCategory') THEN
        CREATE TYPE "TradeCategory" AS ENUM ('GeneralContractor','Plumbing','Electrical','Roofing','HVAC','Framing','Drywall','Flooring','Painting','Concrete','Masonry','Landscaping','Demolition','Waterproofing','Insulation','Windows','Doors','Cabinetry','Tile','Foundation','Excavation','Fencing','Cleaning','Inspector','TitleCompany','Lender','RealEstateAgent','Attorney','PropertyManagement','Other');
      END IF;
    END
    $$;
  `;
  const statements = [
    createEnum,
    `ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "tradeCategory" "TradeCategory";`,
  ];
  for (const sql of statements) {
    process.stdout.write(`-> ${sql.trim().split("\n")[0]} ...\n`);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("TradeCategory migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
