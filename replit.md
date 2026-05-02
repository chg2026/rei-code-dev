# rei-code — Gold Bridge platform monorepo

Atlassian-style real-estate SaaS, three workspaces, two independent
deployments, one dev environment.

## Workspaces

| Path                | Tech                                          | Port (dev) | Notes                                                                                                                |
| ------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `server/`           | Express 5 + Supabase JS + node-cron           | 5000       | Shared API for CHG CRM and Deal Link. Serves `apps/crm/client/build` as a SPA when present.                          |
| `apps/crm/`         | React 19 (CRA) + Supabase                     | 5000 (via server) | The CHG CRM front-end. Workspace was previously `apps/chg/` — renamed to `apps/crm` when CHG Rehab joined the repo. |
| `apps/deallink/`    | React 18 + Vite                               | (n/a in dev) | Linktree-style wholesaler app. Local-state prototype today.                                                          |
| `apps/chg-rehab/`   | Next.js 15 + React 19 + Prisma 6 + iron-session + Stripe | 3000 | Standalone CHG Rehab SaaS. Replit OIDC login. Replit Postgres. Replit Object Storage.                                |
| `packages/ui/`      | (stub)                                        | —          | Reserved for shared UI primitives.                                                                                   |
| `packages/api-client/` | (stub)                                     | —          | Reserved for typed shared API client.                                                                                |

`apps/*` and `packages/*` and `server` are all npm workspaces declared in
the root `package.json`. The repo currently keeps **one root lockfile plus
two legacy nested lockfiles** (`apps/deallink/package-lock.json` and
`apps/crm/client/package-lock.json`) that pre-date the workspace conversion.
Treat the root lockfile as authoritative — do not introduce any **new**
nested lockfiles in workspaces that don't already have one. The two legacy
ones can be removed when their workspaces are next refactored.

## Two deployments, one repo

The Replit project hosts two independent autoscale deployments wired to the
same git repo:

1. **Gold Bridge** (the "main" deployment) — declared in `.replit` under
   `[deployment]`. Build = `npm install && npm run build:prod --workspace=apps/crm`.
   Run = `npm run start --workspace=server`. Serves the CHG CRM at port 5000.
2. **CHG Rehab** — a second autoscale deployment that the user creates and
   maintains separately. Build = `npm install && npm run build --workspace=apps/chg-rehab`.
   Run = `npm run start --workspace=apps/chg-rehab`. Listens on port 3000.

Each deployment has its own secrets pane. CHG Rehab needs the secrets listed
in `apps/chg-rehab/.env.example`; Gold Bridge needs the Supabase secrets
listed in `CLAUDE.md` and `apps/crm/.env.example`.

## Dev workflows

`.replit` defines three workflows (managed via the workflows skill — never
edit `.replit` by hand):

- **Server** — Gold Bridge dev server (port 5000, webview output). Built
  from `apps/crm/client/`, served by `server/index.js`.
- **CHG Rehab** — `next dev -H 0.0.0.0 -p 3000` (console output). Boots in
  ~2 s and is reachable at the dev domain on port 3000.
- **Project** — parallel parent that runs both Server and CHG Rehab. The
  Replit platform auto-creates this wrapper (and points the Run button at
  it) whenever a project has more than one workflow. It is system-managed
  and cannot be removed or edited via the workflows skill — that is normal
  and expected for a multi-service monorepo. To run only one product, click
  the workflow name in the Workflows pane instead of the Run button.

Both ports are forwarded to the public dev domain: `5000 → 80` (Gold Bridge)
and `3000 → 3000` (CHG Rehab).

## Databases

- **Gold Bridge** uses **Supabase** (Postgres + RLS + Auth). Connection
  details live in `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`.
- **CHG Rehab** uses the **Replit Postgres** module declared in `.replit`
  (`postgresql-16`). The `DATABASE_URL` env var is auto-provided by Replit.
  Schema is owned by Prisma at `apps/chg-rehab/prisma/schema.prisma`. Apply
  schema changes with:
  `./node_modules/.bin/prisma db push --schema=apps/chg-rehab/prisma/schema.prisma --accept-data-loss`.
  The post-merge script does this automatically — see below.

The two databases are intentionally separate. Cross-product user identity
will be reconciled when the platform-level Atlassian-style admin is built
(see the `gold-bridge-blueprint.html` plan and Phase 4 in `phase-0-audit.md`).

## Post-merge setup

`scripts/post-merge.sh` runs after every task merge. It:

1. Runs `npm install` at the root (picks up new workspace deps).
2. Generates the Prisma client for `apps/chg-rehab/`.
3. Pushes the Prisma schema to `DATABASE_URL` (no-op when already in sync).
4. Rebuilds `apps/crm/client/` so the Express dev server serves the latest
   bundle without waiting for the next Server-workflow restart.

Configured timeout: 5 minutes (`[postMerge]` in `.replit`).

## Per-company seed scripts

CHG Rehab's main `prisma/seed.ts` operates on a single hard-coded demo
company (`seed-company-chg` / "Cleveland Holding Group"). Real users sign
up via OIDC and get their own `Company` row, which starts with **no**
warehouse departments, subcategories, items, or templates — so `/warehouse`
renders empty until seeded.

To seed the warehouse for an arbitrary company:

```bash
node_modules/.bin/tsx apps/chg-rehab/scripts/seed-warehouse-for-company.ts <companyId>
```

Idempotent and non-destructive — upserts 8 departments and 24 subcategories
by code, seeds the ~195 prototype items **only into subcategories that are
currently empty** (so user-added items are never wiped), and adds 3 system
templates if missing. Pass `--reset` to force a wipe + re-insert of items
across all subcategories (matches the original `prisma/seed.ts` behaviour).

## Conventions and constraints

- **Plain `npm`** — no Turborepo, no Nx, no pnpm.
- **Use `./node_modules/.bin/prisma`**, not `npx prisma` (faster + reproducible).
- **Stripe webhook path** (`/api/stripe/webhook`) is in CHG Rehab's
  middleware allow-list (`apps/chg-rehab/middleware.ts → PUBLIC_PATHS`) and
  must remain there.
- **Never modify `.replit` by hand** — direct edits are blocked. Use the
  workflows skill (`configureWorkflow`), the deployment skill
  (`deployConfig`), and the post-merge skill (`setPostMergeConfig`).
- **Don't move CHG CRM business logic.** The rename `apps/chg → apps/crm`
  is path-only; the Express server, Supabase RLS, and React routes are
  unchanged.
- **CHG Rehab source is verbatim** from the upstream Replit project. The
  only changes the merge made were (a) port 5000 → 3000 in
  `apps/chg-rehab/package.json`, and (b) adding `apps/chg-rehab/.env.example`.
  The full handoff doc from the source project is `apps/chg-rehab/replit.md`.

## Key files

- `CLAUDE.md` — engineering guide for Gold Bridge (CRM + Deal Link).
- `apps/chg-rehab/replit.md` — 587-line CHG Rehab handoff (modules, schema,
  notification scheduler, billing, OIDC, object storage).
- `phase-0-audit.md` — historical CHG CRM security + schema audit (Apr 2026).
- `rei-code-handoff.md` — original Cowork → Claude Code handoff doc.
- `docs/phase-1/` — schema-migration runbooks for Gold Bridge.
- `.local/tasks/merge-chg-rehab-workspace.md` — full plan for the merge that
  produced this layout.
