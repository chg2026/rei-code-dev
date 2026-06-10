---
name: Warehouse catalog self-heal
description: How/why the standard warehouse catalog is auto-seeded as the default for every company, and the constraints around it.
---

# Warehouse standard catalog is a self-healing default

The standard warehouse catalog (8 departments, 24 subcategories, ~195 prototype
items, 3 templates) is the default view for **every** company. The catalog data
+ idempotent seed routine live in `apps/chg-rehab/lib/warehouseSeed.ts`
(`seedWarehouseForCompany(db, companyId, { reset })`); the CLI script
`scripts/seed-warehouse-for-company.ts` is just a thin wrapper around it.

The warehouse page (`app/warehouse/page.tsx`) auto-seeds on render **only when a
company has zero departments**, then re-reads.

**Why:**
- The per-company catalog was once wiped entirely (all companies had 0 warehouse
  rows). Data lives in Supabase, not Replit checkpoints, so it can't be restored
  by rollback. Self-heal makes the catalog reappear without manual re-seeding and
  covers brand-new companies too.
- Seeding can fire from a GET render, so concurrent first-loads could
  double-insert (no DB unique key on items/templates) or leave a partial catalog
  on mid-seed failure.

**How to apply:**
- Keep the self-heal trigger narrow (zero departments). Do NOT broaden it to
  "restore any missing item/template" — that would fight users who intentionally
  delete departments/items.
- `seedWarehouseForCompany` runs everything in one `$transaction` guarded by
  `pg_advisory_xact_lock(hashtext('wh-seed:'+companyId))`. This single-flights
  concurrent seeds and makes it atomic. Preserve both if you touch the routine.
- Item seeding only fills EMPTY subcategories (user-added items are never wiped);
  `--reset` forces a wipe + re-insert.
