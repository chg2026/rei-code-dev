---
name: Invite acceptance flow (chg-rehab)
description: Why /api/invites/use must create the Prisma User inline, and the ordering rule that protects existing accounts.
---

# Invite acceptance must create the Prisma User inline

When an invited user accepts (`/api/invites/use`), create the Prisma `User`
row **inside that route**, not later at login.

**Why:** login's `syncSupabaseUser` (lib/auth.ts) has two branches. The
*create-new* branch (no Prisma user yet) HARD-REQUIRES a Supabase
`user_profiles` row (returns null without one, and again if `account_id` is
null) — but the invite flow never creates a `user_profiles` row, so the user
dead-ends ("can't log in / no workspace"). The *existing-user* branch routes
through `refreshFromSupabase`, which gracefully continues WITHOUT a
`user_profiles` row. Creating the Prisma user up front forces login down the
tolerant path.

**How to apply:** any new "provision a user from outside normal signup" path
(invites, imports) should create the Prisma `User` (id = Supabase auth uid,
`companyId`, role) itself rather than relying on first-login sync. The
`pendingInviteToken` iron-session bridge only works for the create-new
branch, so it's effectively dead once the user is created inline.

# Ordering rule: tenancy guard BEFORE any auth-credential mutation

In invite acceptance, check whether a Prisma user already exists for the
email and whether its `companyId` matches the invite **before** calling any
Supabase `auth.admin.updateUserById({ password })` / create.

**Why:** an earlier version reset an existing auth user's password and only
*then* checked company mismatch (returning 409). That let an invite to an
email owned by another company silently reset that user's password — a
cross-tenant auth-integrity bug.

**How to apply:** resolve identity + tenancy first; only mutate credentials
once you've confirmed the email/account isn't owned by a different company.
Paginate `auth.admin.listUsers` (page/perPage loop) — a single
`perPage:1000` call misses users beyond page 1. Treat a `P2002` unique
conflict on `user.create` as success when a matching row now exists (concurrent accept).

# Schema note

`Invite` uses `companyId` (not `accountId`), status string
`"Pending"|"Accepted"|"Revoked"|"Expired"` with `acceptedAt`/`acceptedById`
(not `"Used"`/`usedAt`). `User` has `firstName`/`lastName`/`initials` (no
single `name`). No migration is needed for invite acceptance — which also
avoids the known cross-schema FK `prisma db push` failure.
