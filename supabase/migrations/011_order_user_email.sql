-- =============================================================================
-- Migration 011: Store client email on production orders
-- =============================================================================
-- production_orders only stored user_id, so client-targeted notifications had
-- no recipient address (and silently sent nothing). Add a user_email column,
-- populated at order creation by the Stripe webhook, and backfill existing
-- rows from auth.users.
--
-- Safe to run multiple times.
-- =============================================================================

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS user_email text;

UPDATE public.production_orders po
SET user_email = u.email
FROM auth.users u
WHERE po.user_id = u.id
  AND po.user_email IS NULL;
