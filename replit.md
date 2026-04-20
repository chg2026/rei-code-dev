# CHG CRM

Internal CRM system for Cleveland Holding Group, used for real estate portfolio management, construction project tracking, property management, and acquisitions.

## Architecture

- **Frontend**: React (Create React App) running on port 5000 at `0.0.0.0`
- **Backend**: Node.js + Express API running on port 3000
- **Database**: Supabase (PostgreSQL)
- **Proxy**: React dev server proxies `/api/*` requests to `http://localhost:3000`

## Project Structure

```
/client          - React frontend (Create React App)
  /src
    App.js       - Main single-page application
/server          - Express backend
  index.js       - Entry point (mounts auth + protected API routes)
  db.js          - Supabase client
  /middleware
    auth.js      - JWT issuance + requireAuth middleware
  /routes        - API route handlers (auth, properties, tenants, projects, deals, tasks, invoices, contractors)
/scripts         - DB utilities (schema.sql, seed.js)
```

## Environment Variables / Secrets Required

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `APP_PASSWORD` - Team password required to log into the CRM. Rotate any time in the Secrets tab.
- `JWT_SECRET` - Secret used to sign session tokens. If rotated, all users will need to log in again.

## Authentication

The CRM is gated behind a single shared team password (`APP_PASSWORD`). Login lives at
`POST /api/auth/login` and returns a 7-day JWT, which the React client stores in
localStorage and sends as `Authorization: Bearer <token>` on every request. All
`/api/*` routes (except `/api/auth/*` and `/api/health`) require a valid token.
A 401 response automatically clears the token and bounces the user back to the
login screen. There is also a "Sign out" button in the app header.

## Running the App

- **Development**: `npm run dev` — starts both frontend (port 5000) and backend (port 3000) concurrently
- **Backend only**: `npm run start:server`
- **Frontend only**: `npm run start:client`
- **Seed database**: `npm run seed`

## Workflow

A single workflow "Start application" runs `npm run dev` and serves on port 5000 (webview).

## Recent Architecture Notes

- **Atomic project + phases creation**: `POST /api/projects` accepts an optional `phases: string[]` field. Server creates the project, then bulk-inserts phase rows; if phase insert fails, the project is rolled back so the client never sees a partial state.
- **Cascade deletes**: `DELETE /api/projects/:id` removes child phases first; `DELETE /api/properties/:id` removes child projects (with their phases), invoices, tenants, and property tasks before deleting the property; `DELETE /api/contractors/:id` nulls `contractor_id` on linked projects first.
- **Properties payload sanitization**: `clean()` in `server/routes/properties.js` converts empty strings to `null` (Postgres dates/numerics reject `''`) and keeps the `type` and `property_type` columns in sync.
- **Standard phase library**: `STANDARD_PHASE_GROUPS` in `client/src/App.js` defines ~22 pre-loaded phases across 6 categories (Structural/Prep, MEP, Walls & Ceiling, Bathroom Remodel, Flooring, Finishes & Install). The Project Form Modal renders these as a checklist (create mode only) with group-level toggles.
- **Contractors directory**: dedicated tab + `ContractorModal` for full CRUD with W-9 status (pending/on_file/not_required) and agreement-signed flag.

## Deployment

- Target: autoscale
- Build: `cd client && npm run build`
- Run: `node server/index.js & npx serve -s client/build -l 5000`
