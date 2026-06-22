---
name: CHG Rehab dev port
description: Which port the CHG Rehab dev workflow actually serves on locally
---

The CHG Rehab dev workflow runs with a `PORT=5000` override
(`PORT=5000 npm run dev --workspace=apps/chg-rehab`), so the live dev server
listens on **port 5000**, not 3000.

**Why:** Replit's webview/preview proxy requires the webview workflow to bind
5000. `replit.md` documents CHG Rehab's logical port as 3000 (its deployment
port), which is misleading for local screenshots/curl.

**How to apply:** When taking an app_preview screenshot or curling the running
CHG Rehab dev server, target port 5000. Port 3000 will refuse the connection
in dev. (The standalone `Server` workflow on 3000 only runs `next start`, which
fails without a prior `next build` — that failure is expected in dev.)
