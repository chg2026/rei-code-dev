-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — analyzer state on deals
-- ═══════════════════════════════════════════════════════════════════════════
-- Persists the Deal Analyzer inputs + a small computed summary onto the
-- owning property record, so a saved analysis is part of the deal and
-- visible from any device.
--
--   • analyzer_state            JSONB NULL — full analyzer payload (inputs +
--                                            computed summary).
--   • analyzer_state_updated_at TIMESTAMPTZ NULL — set server-side on each
--                                            write so the editor can show
--                                            "Last saved <relative time>".
--
-- No new RLS policies — access is already gated by the row's account_id.
-- Idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS analyzer_state            JSONB,
  ADD COLUMN IF NOT EXISTS analyzer_state_updated_at TIMESTAMPTZ;

COMMIT;
