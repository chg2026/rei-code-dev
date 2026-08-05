-- CHG contractor onboarding additive migration (guarded; do not run via Prisma db push).
--
-- Scope: schema additions from d750d89, f88d936, 9c80f12, 61923f0, and
-- 46dcac7. This script intentionally does NOT add CpJob.projectId: that
-- nullable column, its index, and its Project FK were deployed separately.
-- No Supabase auth tables, identities, or auth schema objects are touched.
--
-- Operator preflight (run before this file, in the target database):
--   * Confirm the intended database/project and a current backup/PITR point.
--   * Confirm the existing public tables Company, Project, Contact, and CpAccount.
--   * Confirm no unreviewed schema writer (db push/migration) is running.
--   * If any statement errors, stop; do not improvise or retry against another DB.

BEGIN;

-- Hard preflight: this migration must never silently skip prerequisites or
-- accept a partial/incompatible existing schema. Every failure aborts the
-- transaction and leaves the database unchanged.
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY['Company', 'Project', 'Contact', 'CpAccount'] LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION 'Contractor onboarding migration aborted: required public.% table is missing', required_table;
    END IF;
  END LOOP;
END $$;

-- 1. Prisma enum types. Fresh types are created; existing types must match
-- exactly, including label order. A same-named incompatible enum aborts.
DO $$
DECLARE
  enum_name text;
  expected text[];
  actual text[];
BEGIN
  FOR enum_name, expected IN
    SELECT * FROM (VALUES
      ('ContractorPortalLinkStatus', ARRAY['Linked','AccountFound','NotFound','Disabled','InvitePending']::text[]),
      ('ContractorProjectInvitationStatus', ARRAY['Pending','Accepted','Activated','Declined','Expired','Revoked','Blocked']::text[]),
      ('InviteDeliveryStatus', ARRAY['Pending','Delivered','Failed']::text[])
    ) AS v(name, labels)
  LOOP
    IF to_regtype(format('public.%I', enum_name)) IS NULL THEN
      EXECUTE format('CREATE TYPE public.%I AS ENUM (%s)', enum_name,
        (SELECT string_agg(quote_literal(label), ', ') FROM unnest(expected) AS label));
    ELSE
      SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
        INTO actual
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typname = enum_name;
      IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: enum public.% has labels %, expected exact ordered labels %', enum_name, actual, expected;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 2. Contact link fields. Each ADD COLUMN is independently guarded by
-- to_regclass + pg_attribute so a partial prior run remains additive.
DO $$
BEGIN
  IF to_regclass('public."Contact"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid = to_regclass('public."Contact"')
         AND attname = 'contractorPortalAccountId'
         AND NOT attisdropped
     ) THEN
    ALTER TABLE public."Contact"
      ADD COLUMN "contractorPortalAccountId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."Contact"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid = to_regclass('public."Contact"')
         AND attname = 'contractorPortalLinkStatus'
         AND NOT attisdropped
     ) THEN
    ALTER TABLE public."Contact"
      ADD COLUMN "contractorPortalLinkStatus" public."ContractorPortalLinkStatus"
      NOT NULL DEFAULT 'NotFound';
  END IF;
END $$;

-- 3. Invitation table. A fresh install creates the complete table. An
-- existing table is never "repaired" by adding guessed required columns:
-- every column's type, nullability, and default is validated first. Missing,
-- extra-incompatible, or partially-created state aborts with no data guess.
DO $$
DECLARE
  column_name text;
  expected_type text;
  expected_nullable boolean;
  expected_default text;
  actual_type text;
  actual_type_oid oid;
  actual_nullable boolean;
  actual_default text;
  normalized_actual_default text;
  normalized_expected_default text;
BEGIN
  IF to_regclass('public."ContractorProjectInvitation"') IS NULL THEN
    CREATE TABLE public."ContractorProjectInvitation" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "contactId" TEXT NOT NULL,
      "cpAccountId" TEXT,
      "emailSnapshot" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "roleKey" TEXT NOT NULL,
      "trade" TEXT,
      "status" public."ContractorProjectInvitationStatus" NOT NULL DEFAULT 'Pending',
      "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "inviteTokenHash" TEXT,
      "inviteTokenExpiresAt" TIMESTAMP(3),
      "inviteSentAt" TIMESTAMP(3),
      "inviteDeliveryStatus" public."InviteDeliveryStatus" NOT NULL DEFAULT 'Pending',
      "inviteDeliveryMessageId" TEXT,
      "inviteDeliveryError" TEXT,
      "agreementVersion" TEXT NOT NULL,
      "agreementAcceptedAt" TIMESTAMP(3),
      "acceptedById" TEXT,
      "documentGateState" TEXT NOT NULL DEFAULT 'Pending',
      "complianceGateState" TEXT NOT NULL DEFAULT 'Pending',
      "declinedAt" TIMESTAMP(3),
      "declinedById" TEXT,
      "revokedAt" TIMESTAMP(3),
      "revokedById" TEXT,
      "blockedAt" TIMESTAMP(3),
      "blockedById" TEXT,
      "blockedReason" TEXT,
      "invitedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ContractorProjectInvitation_pkey" PRIMARY KEY ("id")
    );
  ELSE
    FOR column_name, expected_type, expected_nullable, expected_default IN
      SELECT * FROM (VALUES
        ('id','text',false,'none'), ('companyId','text',false,'none'),
        ('projectId','text',false,'none'), ('contactId','text',false,'none'),
        ('cpAccountId','text',true,'none'), ('emailSnapshot','text',false,'none'),
        ('role','text',false,'none'), ('roleKey','text',false,'none'),
        ('trade','text',true,'none'), ('status','enum:ContractorProjectInvitationStatus',false,'Pending'),
        ('invitedAt','timestamp(3) without time zone',false,'current_timestamp'),
        ('expiresAt','timestamp(3) without time zone',false,'none'),
        ('inviteTokenHash','text',true,'none'), ('inviteTokenExpiresAt','timestamp(3) without time zone',true,'none'),
        ('inviteSentAt','timestamp(3) without time zone',true,'none'),
        ('inviteDeliveryStatus','enum:InviteDeliveryStatus',false,'Pending'),
        ('inviteDeliveryMessageId','text',true,'none'), ('inviteDeliveryError','text',true,'none'),
        ('agreementVersion','text',false,'none'), ('agreementAcceptedAt','timestamp(3) without time zone',true,'none'),
        ('acceptedById','text',true,'none'), ('documentGateState','text',false,'Pending'),
        ('complianceGateState','text',false,'Pending'), ('declinedAt','timestamp(3) without time zone',true,'none'),
        ('declinedById','text',true,'none'), ('revokedAt','timestamp(3) without time zone',true,'none'),
        ('revokedById','text',true,'none'), ('blockedAt','timestamp(3) without time zone',true,'none'),
        ('blockedById','text',true,'none'), ('blockedReason','text',true,'none'),
        ('invitedById','text',true,'none'), ('createdAt','timestamp(3) without time zone',false,'current_timestamp'),
        ('updatedAt','timestamp(3) without time zone',false,'none')
      ) AS v(name, typ, nullable, default_kind)
    LOOP
      SELECT format_type(a.atttypid, a.atttypmod), a.atttypid, NOT a.attnotnull,
             CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin, d.adrelid) END
        INTO actual_type, actual_type_oid, actual_nullable, actual_default
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = to_regclass('public."ContractorProjectInvitation"')
        AND a.attname = column_name AND NOT a.attisdropped;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: existing ContractorProjectInvitation is missing required column %; no data-safe repair is possible', column_name;
      END IF;
      IF expected_type LIKE 'enum:%' THEN
        IF actual_type_oid <> to_regtype(format('public.%I', substring(expected_type from 6))) THEN
          RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation.% has type %, expected %', column_name, actual_type, expected_type;
        END IF;
      ELSIF lower(actual_type) <> lower(expected_type) THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation.% has type %, expected %', column_name, actual_type, expected_type;
      END IF;
      IF actual_nullable IS DISTINCT FROM expected_nullable THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation.% nullability is %, expected %', column_name, actual_nullable, expected_nullable;
      END IF;
      IF expected_default = 'none' AND actual_default IS NOT NULL THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation.% has unexpected default %', column_name, actual_default;
      ELSIF expected_default <> 'none' THEN
        normalized_actual_default := lower(regexp_replace(trim(actual_default), '[[:space:]]+', '', 'g'));
        normalized_expected_default := CASE expected_default
          WHEN 'current_timestamp' THEN lower('CURRENT_TIMESTAMP')
          WHEN 'Pending' THEN lower(format('%L::%s', 'Pending', format_type(to_regtype(format('public.%I', CASE WHEN column_name = 'inviteDeliveryStatus' THEN 'InviteDeliveryStatus' ELSE 'ContractorProjectInvitationStatus' END)), NULL)))
          ELSE NULL
        END;
        IF normalized_actual_default IS DISTINCT FROM normalized_expected_default THEN
          RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation.% has canonical default %, expected %', column_name, actual_default, normalized_expected_default;
        END IF;
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public."ContractorProjectInvitation"')
        AND c.conname = 'ContractorProjectInvitation_pkey' AND c.contype = 'p'
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass('public."ContractorProjectInvitation"') AND attname = 'id' AND NOT attisdropped)]::smallint[]
    ) THEN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public."ContractorProjectInvitation"') AND conname = 'ContractorProjectInvitation_pkey') THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: ContractorProjectInvitation_pkey is incompatible';
      END IF;
      ALTER TABLE public."ContractorProjectInvitation" ADD CONSTRAINT "ContractorProjectInvitation_pkey" PRIMARY KEY ("id");
    END IF;
  END IF;
END $$;

-- Existing Contact columns are repaired only when absent; present columns are
-- validated exactly so a same-name incompatible column cannot pass silently.
DO $$
DECLARE
  column_name text;
  actual_type text;
  actual_type_oid oid;
  actual_nullable boolean;
  actual_default text;
  normalized_actual_default text;
  normalized_expected_default text;
BEGIN
  FOR column_name IN SELECT unnest(ARRAY['contractorPortalAccountId','contractorPortalLinkStatus']) LOOP
    SELECT format_type(a.atttypid, a.atttypmod), a.atttypid, NOT a.attnotnull,
           CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin, d.adrelid) END
      INTO actual_type, actual_type_oid, actual_nullable, actual_default
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=to_regclass('public."Contact"') AND a.attname=column_name AND NOT a.attisdropped;
    IF column_name='contractorPortalAccountId' THEN
      IF FOUND AND (actual_type <> 'text' OR actual_nullable IS DISTINCT FROM true OR actual_default IS NOT NULL) THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: Contact.% definition is incompatible', column_name;
      END IF;
    ELSE
      normalized_actual_default := CASE WHEN actual_default IS NULL THEN NULL ELSE lower(regexp_replace(trim(actual_default), '[[:space:]]+', '', 'g')) END;
      normalized_expected_default := lower(format('%L::%s', 'NotFound', format_type(to_regtype('public."ContractorPortalLinkStatus"'), NULL)));
      IF FOUND AND (actual_type_oid <> to_regtype('public."ContractorPortalLinkStatus"') OR actual_nullable IS DISTINCT FROM false OR normalized_actual_default IS DISTINCT FROM normalized_expected_default) THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: Contact.% definition is incompatible', column_name;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 4. Indexes and unique constraints. A same-name object is accepted only
-- when its public schema/table, ordered plain key columns, uniqueness, btree
-- method, predicate/include shape, ordering, and default opclasses match.
DO $$
DECLARE
  index_name text;
  table_name text;
  expected_columns text[];
  expected_unique boolean;
  rel_kind "char";
  actual_unique boolean;
  actual_columns text[];
  index_oid oid;
  actual_indrelid oid;
  actual_nkeyatts smallint;
  actual_natts smallint;
  actual_indoption int2[];
  has_predicate boolean;
  has_nondefault_opclass boolean;
BEGIN
  FOR index_name, table_name, expected_columns, expected_unique IN
    SELECT * FROM (VALUES
      ('Contact_contractorPortalAccountId_idx','Contact',ARRAY['contractorPortalAccountId']::text[],false),
      ('ContractorProjectInvitation_inviteTokenHash_key','ContractorProjectInvitation',ARRAY['inviteTokenHash']::text[],true),
      ('ContractorProjectInvitation_companyId_projectId_contactId_r_key','ContractorProjectInvitation',ARRAY['companyId','projectId','contactId','roleKey']::text[],true),
      ('ContractorProjectInvitation_companyId_status_idx','ContractorProjectInvitation',ARRAY['companyId','status']::text[],false),
      ('ContractorProjectInvitation_companyId_projectId_status_idx','ContractorProjectInvitation',ARRAY['companyId','projectId','status']::text[],false),
      ('ContractorProjectInvitation_contactId_status_idx','ContractorProjectInvitation',ARRAY['contactId','status']::text[],false),
      ('ContractorProjectInvitation_cpAccountId_idx','ContractorProjectInvitation',ARRAY['cpAccountId']::text[],false)
    ) AS v(name, relation_name, columns, is_unique)
  LOOP
    SELECT c.oid, c.relkind, i.indisunique, i.indrelid, i.indnkeyatts, i.indnatts,
           i.indoption, i.indpred IS NOT NULL,
           ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                 LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
                 ORDER BY k.ord)
      INTO index_oid, rel_kind, actual_unique, actual_indrelid, actual_nkeyatts,
           actual_natts, actual_indoption, has_predicate, actual_columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_index i ON i.indexrelid=c.oid
    WHERE n.nspname='public' AND c.relname=index_name;
    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1
        FROM unnest((SELECT indclass FROM pg_index WHERE indexrelid=index_oid)) WITH ORDINALITY AS actual(opclass, ord)
        JOIN unnest((SELECT indkey FROM pg_index WHERE indexrelid=index_oid)) WITH ORDINALITY AS key(attnum, ord)
          ON key.ord = actual.ord
        JOIN pg_attribute a ON a.attrelid = actual_indrelid AND a.attnum = key.attnum
        WHERE actual.opclass IS DISTINCT FROM (
          SELECT opc.oid
          FROM pg_opclass opc
          WHERE opc.opcmethod = (SELECT oid FROM pg_am WHERE amname='btree')
            AND opc.opcintype = a.atttypid
            AND opc.opcdefault
        )
      ) INTO has_nondefault_opclass;
      IF rel_kind <> 'i' OR actual_unique IS DISTINCT FROM expected_unique
         OR actual_columns IS DISTINCT FROM expected_columns
         OR actual_indrelid <> to_regclass(format('public.%I', table_name))
         OR (SELECT amname FROM pg_am WHERE oid=(SELECT relam FROM pg_class WHERE oid=index_oid)) <> 'btree' THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: index public.% has incompatible definition', index_name;
      END IF;
      IF actual_nkeyatts <> cardinality(expected_columns) OR actual_natts <> actual_nkeyatts
         OR has_predicate OR actual_indoption IS DISTINCT FROM array_fill(0::int2, ARRAY[cardinality(expected_columns)])
         OR has_nondefault_opclass THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: index public.% is not the exact plain default btree definition', index_name;
      END IF;
    ELSE
      EXECUTE format('CREATE %s INDEX %I ON public.%I (%s)',
        CASE WHEN expected_unique THEN 'UNIQUE' ELSE '' END, index_name, table_name,
        (SELECT string_agg(format('%I', c), ', ') FROM unnest(expected_columns) AS c));
    END IF;
  END LOOP;
END $$;

-- 5. Foreign keys. Same-name constraints are accepted only when every
-- definition component matches: local/referenced table and ordered columns,
-- plus ON DELETE and ON UPDATE actions.
DO $$
DECLARE
  constraint_name text;
  local_table text;
  local_columns text[];
  referenced_table text;
  referenced_columns text[];
  delete_action "char";
  update_action "char";
  actual_local_table text;
  actual_referenced_table text;
  actual_local_columns text[];
  actual_referenced_columns text[];
  actual_delete "char";
  actual_update "char";
  actual_referenced_schema text;
BEGIN
  FOR constraint_name, local_table, local_columns, referenced_table, referenced_columns, delete_action, update_action IN
    SELECT * FROM (VALUES
      ('Contact_contractorPortalAccountId_fkey','Contact',ARRAY['contractorPortalAccountId']::text[],'CpAccount',ARRAY['id']::text[],'n'::"char",'c'::"char"),
      ('ContractorProjectInvitation_companyId_fkey','ContractorProjectInvitation',ARRAY['companyId']::text[],'Company',ARRAY['id']::text[],'c'::"char",'c'::"char"),
      ('ContractorProjectInvitation_projectId_fkey','ContractorProjectInvitation',ARRAY['projectId']::text[],'Project',ARRAY['id']::text[],'c'::"char",'c'::"char"),
      ('ContractorProjectInvitation_contactId_fkey','ContractorProjectInvitation',ARRAY['contactId']::text[],'Contact',ARRAY['id']::text[],'c'::"char",'c'::"char"),
      ('ContractorProjectInvitation_cpAccountId_fkey','ContractorProjectInvitation',ARRAY['cpAccountId']::text[],'CpAccount',ARRAY['id']::text[],'n'::"char",'c'::"char")
    ) AS v(name, local_name, local_keys, foreign_name, foreign_keys, on_delete, on_update)
  LOOP
    SELECT lt.relname, rt.relname,
           ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord),
           ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord),
           c.confdeltype, c.confupdtype, rn.nspname
      INTO actual_local_table, actual_referenced_table, actual_local_columns, actual_referenced_columns, actual_delete, actual_update, actual_referenced_schema
    FROM pg_constraint c
    JOIN pg_class lt ON lt.oid=c.conrelid JOIN pg_namespace ln ON ln.oid=lt.relnamespace
    JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    WHERE ln.nspname='public' AND c.conname=constraint_name AND c.contype='f';
    IF FOUND THEN
      IF actual_local_table IS DISTINCT FROM local_table OR actual_local_columns IS DISTINCT FROM local_columns
         OR actual_referenced_table IS DISTINCT FROM referenced_table OR actual_referenced_columns IS DISTINCT FROM referenced_columns
         OR actual_referenced_schema IS DISTINCT FROM 'public'
         OR actual_delete IS DISTINCT FROM delete_action OR actual_update IS DISTINCT FROM update_action THEN
        RAISE EXCEPTION 'Contractor onboarding migration aborted: foreign key public.% has incompatible definition', constraint_name;
      END IF;
    ELSIF EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND c.conname=constraint_name
    ) THEN
      RAISE EXCEPTION 'Contractor onboarding migration aborted: constraint name public.% is already used by a non-matching constraint', constraint_name;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s) ON DELETE %s ON UPDATE %s',
        local_table, constraint_name,
        (SELECT string_agg(format('%I', c), ', ') FROM unnest(local_columns) AS c),
        referenced_table,
        (SELECT string_agg(format('%I', c), ', ') FROM unnest(referenced_columns) AS c),
        CASE delete_action WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE' ELSE 'NO ACTION' END,
        CASE update_action WHEN 'c' THEN 'CASCADE' ELSE 'NO ACTION' END);
    END IF;
  END LOOP;
END $$;

-- Verification result set (run only after an approved operator executes this
-- file; these SELECTs do not inspect or return token values).
SELECT typname AS enum_name
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND typname IN ('ContractorPortalLinkStatus', 'ContractorProjectInvitationStatus', 'InviteDeliveryStatus')
ORDER BY typname;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('Contact', 'ContractorProjectInvitation', 'Company', 'Project', 'CpAccount')
ORDER BY table_name;

SELECT table_name, column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'Contact' AND column_name IN ('contractorPortalAccountId', 'contractorPortalLinkStatus'))
    OR (table_name = 'ContractorProjectInvitation'))
ORDER BY table_name, ordinal_position;

SELECT c.relname AS index_name, t.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_index i ON i.indexrelid = c.oid
JOIN pg_class t ON t.oid = i.indrelid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'Contact_contractorPortalAccountId_idx',
    'ContractorProjectInvitation_inviteTokenHash_key',
    'ContractorProjectInvitation_companyId_projectId_contactId_r_key',
    'ContractorProjectInvitation_companyId_status_idx',
    'ContractorProjectInvitation_companyId_projectId_status_idx',
    'ContractorProjectInvitation_contactId_status_idx',
    'ContractorProjectInvitation_cpAccountId_idx'
  )
ORDER BY c.relname;

SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conname IN (
  'Contact_contractorPortalAccountId_fkey',
  'ContractorProjectInvitation_companyId_fkey',
  'ContractorProjectInvitation_projectId_fkey',
  'ContractorProjectInvitation_contactId_fkey',
  'ContractorProjectInvitation_cpAccountId_fkey'
)
ORDER BY conname;

COMMIT;
