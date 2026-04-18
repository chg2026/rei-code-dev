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
  index.js       - Entry point
  db.js          - Supabase client
  /routes        - API route handlers (properties, tenants, projects, deals, tasks, invoices, contractors)
/scripts         - DB utilities (schema.sql, seed.js)
```

## Environment Variables / Secrets Required

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

## Running the App

- **Development**: `npm run dev` — starts both frontend (port 5000) and backend (port 3000) concurrently
- **Backend only**: `npm run start:server`
- **Frontend only**: `npm run start:client`
- **Seed database**: `npm run seed`

## Workflow

A single workflow "Start application" runs `npm run dev` and serves on port 5000 (webview).

## Deployment

- Target: autoscale
- Build: `cd client && npm run build`
- Run: `node server/index.js & npx serve -s client/build -l 5000`
