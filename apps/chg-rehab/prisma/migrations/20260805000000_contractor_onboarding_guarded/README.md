# CHG contractor onboarding guarded migration

**Version:** `20260805000000`

**Script:** [`migration.sql`](./migration.sql)

This is an additive, repeatable SQL migration for the schema required by the
CHG contractor onboarding commits `d750d89`, `f88d936`, `9c80f12`, `61923f0`,
and `46dcac7`.

It adds:

- `ContractorPortalLinkStatus` and the Contact portal-account columns,
  index, and `CpAccount` foreign key.
- `ContractorProjectInvitationStatus` and `InviteDeliveryStatus`.
- `ContractorProjectInvitation`, including token fields, delivery fields,
  agreement/compliance lifecycle fields, indexes, the composite unique key,
  and `Company`, `Project`, `Contact`, and optional `CpAccount` foreign keys.

It deliberately does **not** add `CpJob.projectId`, its index, or its Project
foreign key. That nullable bridge was deployed earlier by a separate guarded
SQL change. Do not duplicate it here.

## Safe execution order

1. **Review the exact target.** Confirm the SQL editor is connected to the
   intended shared Supabase database. Do not paste credentials, tokens, or
   connection strings into this repository or this runbook.
2. **Take/confirm a current backup or PITR restore point.** This migration is
   additive, but the backup is an operator safety requirement.
3. **Run the preflight queries below, one at a time.** `Company`, `Project`,
   `Contact`, and `CpAccount` must exist in `public`. If one is absent, stop;
   do not create a substitute table and do not touch `auth`.
4. **Understand the abort contract before running.** Existing enums are checked
   against their exact ordered labels. Existing Contact columns and an existing
   `ContractorProjectInvitation` table are checked for required names, exact
   types, nullability, defaults, and primary key. A missing required invitation
   column or any mismatch is an intentional hard error: stop and reconcile the
   database with a separately reviewed, data-aware procedure. This file will
   not guess values or add required columns to an existing invitation table.
5. **Check for concurrent schema work.** Coordinate with anyone using Prisma or
   the Supabase SQL editor. Never run `prisma db push` for this change.
6. **Paste the entire `migration.sql` into the Supabase SQL editor and run it
   once.** The script uses one transaction. It creates fresh objects, adds only
   absent Contact link columns, and validates existing indexes/unique indexes
   and foreign keys by full definition, not by name alone. Indexes must be in
   `public`, target the exact table, use ordered plain key columns with no
   predicate or `INCLUDE` columns, use ascending/default-null ordering and the
   default btree operator class for every key, and match uniqueness. Foreign
   keys must reference `public` and match the exact ordered local/referenced
   columns plus `ON DELETE` and `ON UPDATE` actions. Existing Contact status
   and invitation status/delivery defaults are compared using normalized exact
   `pg_get_expr` expressions; `updatedAt` must have no database default. Do not
   split or reorder its statements.
7. **If any statement errors, abort and preserve the exact error.** The
   transaction is expected to roll back. Do not retry against another database,
   rename a conflicting object, or manually weaken a `NOT NULL`, FK, enum,
   default, or uniqueness requirement. A mismatch is a deployment blocker, not
   a state this migration may silently accept.
8. **Run the post-check queries below, one at a time.** Expected counts are
   included. These checks return schema metadata only and never return token
   hashes or raw invite tokens.
9. **Only after all checks pass**, coordinate the application/client deployment
   that consumes the schema. SQL application and app publish are separate
   operations.

## Preflight queries

```sql
SELECT to_regclass('public."Company"') AS company_table,
       to_regclass('public."Project"') AS project_table,
       to_regclass('public."Contact"') AS contact_table,
       to_regclass('public."CpAccount"') AS cp_account_table;

SELECT to_regclass('public."CpJob"') AS cp_job_table,
       EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = to_regclass('public."CpJob"')
           AND attname = 'projectId'
           AND NOT attisdropped
       ) AS cp_job_project_id_already_present;
```

The second query documents the intentional boundary: `CpJob.projectId` should
already be present. This migration does not add or modify it.

## Post-check queries

### 1. Enum types — expect exactly 3 rows

```sql
SELECT n.nspname AS schema_name, t.typname AS enum_name
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN (
    'ContractorPortalLinkStatus',
    'ContractorProjectInvitationStatus',
    'InviteDeliveryStatus'
  )
ORDER BY t.typname;
```

### 2. Contact columns — expect exactly 2 rows

```sql
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Contact'
  AND column_name IN (
    'contractorPortalAccountId',
    'contractorPortalLinkStatus'
  )
ORDER BY column_name;
```

`contractorPortalAccountId` is nullable. `contractorPortalLinkStatus` is
non-null with default `NotFound`.

### 3. Invitation columns — expect exactly 33 rows

```sql
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ContractorProjectInvitation'
ORDER BY ordinal_position;
```

The result must include `inviteTokenHash`, `inviteTokenExpiresAt`,
`inviteSentAt`, `inviteDeliveryStatus`, `inviteDeliveryMessageId`, and
`inviteDeliveryError`. `updatedAt` is `TIMESTAMP(3) NOT NULL` with no database
default, matching the Prisma schema. Never select token values from the table.

### 4. Indexes and unique keys — expect exactly 7 rows

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'Contact_contractorPortalAccountId_idx',
    'ContractorProjectInvitation_inviteTokenHash_key',
    'ContractorProjectInvitation_companyId_projectId_contactId_r_key',
    'ContractorProjectInvitation_companyId_status_idx',
    'ContractorProjectInvitation_companyId_projectId_status_idx',
    'ContractorProjectInvitation_contactId_status_idx',
    'ContractorProjectInvitation_cpAccountId_idx'
  )
ORDER BY indexname;
```

The two names ending in `_key` must be unique indexes.

### 5. Foreign keys — expect exactly 5 rows

```sql
SELECT conname,
       conrelid::regclass AS table_name,
       confrelid::regclass AS referenced_table,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'Contact_contractorPortalAccountId_fkey',
  'ContractorProjectInvitation_companyId_fkey',
  'ContractorProjectInvitation_projectId_fkey',
  'ContractorProjectInvitation_contactId_fkey',
  'ContractorProjectInvitation_cpAccountId_fkey'
)
ORDER BY conname;
```

Expected targets are `CpAccount`, `Company`, `Project`, `Contact`, and
`CpAccount`, respectively. The Contact and invitation optional account links
use `ON DELETE SET NULL`; company/project/contact ownership links use
`ON DELETE CASCADE`, matching the Prisma schema.

### 6. Existing CpJob bridge — expect the column and index to remain present

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_attribute
  WHERE attrelid = to_regclass('public."CpJob"')
    AND attname = 'projectId'
    AND NOT attisdropped
) AS cp_job_project_id_present,
EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'CpJob_projectId_idx'
    AND c.relkind = 'i'
) AS cp_job_project_id_index_present;
```

This is a preservation check only. If either value is false, stop and use the
already-approved prior `CpJob.projectId` guarded deployment procedure rather
than modifying this migration.
