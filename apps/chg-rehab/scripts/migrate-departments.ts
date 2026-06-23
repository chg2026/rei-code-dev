/**
 * One-time migration for the Company Departments system.
 *
 * For every Company:
 *   1. Delete the legacy seeded PmSpaces named "Construction", "Marketing",
 *      and "Property Management List" (deleting a space cascades to its
 *      lists, tasks, statuses and tags — confirmed intentional).
 *   2. Ensure a "Braindump" department exists (color #6366f1, order 0).
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node_modules/.bin/tsx apps/chg-rehab/scripts/migrate-departments.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SPACES_TO_REMOVE = ["Construction", "Marketing", "Property Management List"];
const BRAINDUMP = "Braindump";

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Found ${companies.length} compan${companies.length === 1 ? "y" : "ies"}.`);

  let deleted = 0;
  let created = 0;

  for (const company of companies) {
    const label = company.name || company.id;

    const toDelete = await prisma.pmSpace.findMany({
      where: { companyId: company.id, name: { in: SPACES_TO_REMOVE } },
      select: { id: true, name: true },
    });
    for (const space of toDelete) {
      await prisma.pmSpace.delete({ where: { id: space.id } });
      deleted += 1;
      console.log(`[${label}] deleted space "${space.name}" (${space.id})`);
    }

    const existing = await prisma.pmSpace.findFirst({
      where: { companyId: company.id, name: BRAINDUMP },
      select: { id: true },
    });
    if (existing) {
      console.log(`[${label}] "${BRAINDUMP}" already exists (${existing.id})`);
    } else {
      const space = await prisma.pmSpace.create({
        data: { companyId: company.id, name: BRAINDUMP, color: "#6366f1", order: 0 },
      });
      created += 1;
      console.log(`[${label}] created "${BRAINDUMP}" space (${space.id})`);
    }
  }

  console.log(`\nDone. Deleted ${deleted} legacy space(s); created ${created} "${BRAINDUMP}" space(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
