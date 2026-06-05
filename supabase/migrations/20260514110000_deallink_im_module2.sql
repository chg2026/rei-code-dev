-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — Investment Memorandum (IM) Module 2
-- ═══════════════════════════════════════════════════════════════════════════
-- Module 2: buyer-facing IM gate (SMS verification + buyer accounts +
-- "Deals shared with me" log).
--
-- Per the handoff PDF §3.1–3.3:
--   buyer_accounts          — accounts created through the IM gate
--   sms_verification_codes  — 6-digit Twilio codes (10-min expiry)
--   shared_deals_log        — which deal each buyer has unlocked
--
-- Buyer auth lives ENTIRELY in this table — completely separate from the
-- existing Supabase wholesaler `auth.users` / `user_profiles` system. A
-- buyer JWT issued by /api/auth/buyer/verify-code never grants access to
-- wholesaler-only routes.
--
-- All three tables use the service-role client server-side (no RLS needed
-- — all reads/writes go through the Express endpoints which validate the
-- buyer JWT). The handoff PDF does not specify RLS for these tables.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 3.1 buyer_accounts ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyer_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100) NOT NULL,
  phone               VARCHAR(20)  NOT NULL UNIQUE,         -- E.164
  phone_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
  wholesaler_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ
);

-- 3.2 sms_verification_codes ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) NOT NULL,
  code        VARCHAR(6)  NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sms_verification_codes_phone_idx
  ON public.sms_verification_codes (phone);
CREATE INDEX IF NOT EXISTS sms_verification_codes_phone_created_idx
  ON public.sms_verification_codes (phone, created_at DESC);

-- 3.3 shared_deals_log ---------------------------------------------------
-- buyer_id → buyer_accounts.id  (CASCADE — if a buyer account is deleted,
--                                their access log goes with it)
-- deal_id  → deallink_deals.id  (CASCADE — same for deals)
CREATE TABLE IF NOT EXISTS public.shared_deals_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         UUID NOT NULL REFERENCES public.buyer_accounts (id) ON DELETE CASCADE,
  deal_id          UUID NOT NULL REFERENCES public.deallink_deals  (id) ON DELETE CASCADE,
  accessed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  offer_submitted  BOOLEAN     NOT NULL DEFAULT FALSE,
  UNIQUE (buyer_id, deal_id)         -- a buyer "unlocks" each deal once
);
CREATE INDEX IF NOT EXISTS shared_deals_log_buyer_idx
  ON public.shared_deals_log (buyer_id, accessed_at DESC);

COMMIT;
