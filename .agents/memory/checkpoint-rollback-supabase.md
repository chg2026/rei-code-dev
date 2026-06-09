---
name: Checkpoint rollback can't restore CHG data
description: Why Replit checkpoint rollback does not recover CHG Rehab / Investor Portal data loss.
---

# Replit checkpoint rollback does NOT restore CHG data

CHG Rehab + Investor Portal Prisma data lives in **Supabase** — `DATABASE_URL`
resolves to a `supabase.co` host, despite `replit.md` claiming Replit-managed
Postgres. Replit checkpoint rollbacks only restore the Replit-managed built-in
database + the workspace filesystem + chat. They do **not** snapshot or restore
external services like Supabase.

**Why:** A user asked to roll back to recover wiped warehouse data
(WarehouseDepartment/Subcategory/Item/Template all 0 rows across every company).
A rollback would have reverted all apps' code + chat for nothing and left the
Supabase data still empty.

**How to apply:** For CHG/Investor data loss, do NOT suggest a Replit checkpoint
rollback. Use Supabase backups / Point-in-Time Recovery (Supabase dashboard →
Database → Backups), or re-seed via
`apps/chg-rehab/scripts/seed-warehouse-for-company.ts <companyId>` (idempotent;
restores 8 depts / 24 subs / ~195 items / 3 templates, but NOT custom items).
A Replit rollback is whole-repo (all apps + packages + server + root config),
never folder-scoped.
