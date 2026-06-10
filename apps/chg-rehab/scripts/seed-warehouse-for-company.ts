/**
 * Seed warehouse departments, subcategories, items, and templates for a given company.
 *
 * Idempotent — re-running upserts departments/subcategories by code, refreshes
 * the item list per subcategory, and adds any missing templates. The catalog
 * data and seeding routine now live in `lib/warehouseSeed.ts` so the warehouse
 * page can auto-restore the standard catalog for any empty company.
 *
 * Usage:
 *   tsx apps/chg-rehab/scripts/seed-warehouse-for-company.ts <companyId>
 *   # or, when no arg is given, set TARGET_COMPANY_ID env var
 *   # pass --reset to wipe + re-insert items in subcategories that already have items
 */

import { PrismaClient } from "@prisma/client";
import { seedWarehouseForCompany } from "../lib/warehouseSeed";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const RESET_ITEMS = args.includes("--reset");
const positional = args.filter((a) => !a.startsWith("--"));

async function main() {
  const companyId = positional[0] || process.env.TARGET_COMPANY_ID;
  if (!companyId) {
    console.error("Usage: tsx seed-warehouse-for-company.ts <companyId> [--reset]");
    console.error("  --reset  also wipe + re-insert items in subcategories that already have items");
    process.exit(1);
  }
  await seedWarehouseForCompany(prisma, companyId, { reset: RESET_ITEMS });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
