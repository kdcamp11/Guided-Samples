-- Migration 009: Single-supplier backfill
-- We operate with one supplier for now, so every production order is
-- assigned to them.  Backfill any existing orders that were created
-- before auto-assignment was added (supplier_email was null).

update public.production_orders
set
  supplier_email = coalesce(supplier_email, 'k.campjr@gmail.com'),
  supplier_name  = coalesce(supplier_name, 'Production Partner')
where supplier_email is null;
