-- =============================================================================
-- Migration 007: Dual production path
-- =============================================================================
-- Adds columns to production_orders supporting both the SAMPLE path
-- (sample fee → first piece review → deposit → bulk → final payment)
-- and the DIRECT path (single checkout → bulk → final payment).
--
-- Adds 5 new stage enum values to public.production_stage.
-- Safe to run multiple times.
-- =============================================================================

-- ─── 1. New stage enum values ─────────────────────────────────────────────────

ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'AWAITING_FIRST_PIECE';
ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'CLOSED_SAMPLE_ONLY';
ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'AWAITING_PRODUCTION_DEPOSIT';
ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'AWAITING_FINAL_PAYMENT';
ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'READY_TO_SHIP';

-- ─── 2. New columns on production_orders ──────────────────────────────────────

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS production_path TEXT CHECK (production_path IN ('SAMPLE', 'DIRECT')),
  ADD COLUMN IF NOT EXISTS sample_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS sample_stripe_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sample_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_stripe_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS final_stripe_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS final_paid_at TIMESTAMPTZ;

-- =============================================================================
