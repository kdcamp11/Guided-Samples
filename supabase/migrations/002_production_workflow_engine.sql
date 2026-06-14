-- =============================================================================
-- Migration 002: Production workflow engine
-- =============================================================================
-- Adds production_stage as the single canonical stage field on
-- production_orders.  All portals read from this field; no parallel stage
-- columns exist for client vs. supplier views.
--
-- Applies on top of 001_production_hub.sql.
-- Safe to run multiple times.
-- =============================================================================

-- ─── 1. Stage enum ────────────────────────────────────────────────────────────

do $$ begin
  create type public.production_stage as enum (
    'PRODUCTION_FILES_RECEIVED',
    'FIRST_PIECE_IN_PRODUCTION',
    'FIRST_PIECE_REVIEW',
    'SAMPLE_SHIPPED',
    'SAMPLE_DELIVERED',
    'CLIENT_SAMPLE_EVALUATION',
    'REVISION_REQUIRED',
    'BULK_PRODUCTION',
    'QUALITY_CHECK',
    'PACKING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end $$;

-- ─── 2. New columns on production_orders ──────────────────────────────────────

-- production_stage: the one canonical field — null until payment confirmed
alter table public.production_orders
  add column if not exists production_stage public.production_stage default null;

comment on column public.production_orders.production_stage is
  'Single source of truth for the factory/portal lifecycle. '
  'Null until enterProductionWorkflow() is called after payment. '
  'All portals derive status from this field only.';

-- Timestamp columns introduced by the workflow engine
alter table public.production_orders
  add column if not exists production_started_at  timestamptz default null,
  add column if not exists sample_shipped_at       timestamptz default null,
  add column if not exists sample_delivered_at     timestamptz default null;

-- Revision feedback surfaced as a first-class column for queryability
alter table public.production_orders
  add column if not exists revision_notes text default null;

comment on column public.production_orders.revision_notes is
  'Populated when entering REVISION_REQUIRED stage. '
  'Full history available in production_order_events.';

-- ─── 3. Enforce single-source constraint ──────────────────────────────────────
--
-- Ensure no code can write to production_stage outside of a known enum value.
-- The enum type already enforces this at the DB level; this comment documents intent.
--
-- The application service (workflowEngine.ts) is the ONLY writer of this column.
-- RLS allows users to read their own orders but the service layer validates
-- every transition before writing.

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_production_orders_stage
  on public.production_orders (production_stage)
  where production_stage is not null;

-- Composite index for factory dashboard queries (stage + age)
create index if not exists idx_production_orders_stage_updated
  on public.production_orders (production_stage, updated_at asc)
  where production_stage is not null
    and production_stage not in ('DELIVERED', 'CANCELLED');

-- ─── 5. Audit log: event_type check ───────────────────────────────────────────
--
-- Extend the event_type values recognised in the events table.
-- The column is text (not an enum) so no DDL change is needed —
-- the application enforces valid event_type values.
--
-- Recognised event_type values after this migration:
--   order_created          (from 001)
--   payment_confirmed      (from 001)
--   stage_transition       (NEW — wraps StageTransitionEvent JSON in metadata)
--   order_cancelled        (from 001, still used for the payment-level cancel)
--   note_added             (from 001)
--   status_overridden      (from 001, admin use)

-- ─── 6. Database function for atomic stage transition (optional / recommended) ─
--
-- For strict atomicity, the application can call this RPC instead of the two
-- separate UPDATE + INSERT that workflowEngine.ts performs.
--
-- Usage from JS:
--   supabase.rpc('transition_production_stage', {
--     p_order_id:   '<uuid>',
--     p_to_stage:   'QUALITY_CHECK',
--     p_actor_id:   '<user-uuid>',
--     p_metadata:   { qc_inspector: 'Jane' },
--   })

create or replace function public.transition_production_stage(
  p_order_id  uuid,
  p_to_stage  public.production_stage,
  p_actor_id  uuid    default null,
  p_metadata  jsonb   default '{}'
)
returns jsonb
language plpgsql
security definer          -- runs with owner privileges; validate caller via RLS on the table
as $$
declare
  v_from_stage   public.production_stage;
  v_now          timestamptz := now();
  v_timestamps   jsonb := '{}';
  v_event_meta   jsonb;
begin
  -- Lock and read current stage
  select production_stage
  into   v_from_stage
  from   public.production_orders
  where  id = p_order_id
  for update;

  if not found then
    raise exception 'production_order % not found', p_order_id;
  end if;

  if v_from_stage is null then
    raise exception 'Order % has no production_stage. Call enterProductionWorkflow first.', p_order_id;
  end if;

  -- Build timestamp side-effects
  if p_to_stage = 'SAMPLE_SHIPPED'   then v_timestamps := v_timestamps || jsonb_build_object('sample_shipped_at',   v_now); end if;
  if p_to_stage = 'SAMPLE_DELIVERED' then v_timestamps := v_timestamps || jsonb_build_object('sample_delivered_at', v_now); end if;
  if p_to_stage = 'SHIPPED'          then v_timestamps := v_timestamps || jsonb_build_object('shipped_at',          v_now); end if;
  if p_to_stage = 'DELIVERED'        then v_timestamps := v_timestamps || jsonb_build_object('delivered_at',        v_now); end if;

  -- Update stage (transition graph validation is done in the application layer)
  update public.production_orders
  set
    production_stage = p_to_stage,
    updated_at       = v_now,
    tracking_number  = coalesce((p_metadata->>'tracking_number')::text, tracking_number),
    carrier          = coalesce((p_metadata->>'carrier')::text, carrier),
    revision_notes   = coalesce((p_metadata->>'revision_notes')::text, revision_notes),
    sample_shipped_at   = coalesce((v_timestamps->>'sample_shipped_at')::timestamptz,   sample_shipped_at),
    sample_delivered_at = coalesce((v_timestamps->>'sample_delivered_at')::timestamptz, sample_delivered_at),
    shipped_at          = coalesce((v_timestamps->>'shipped_at')::timestamptz,          shipped_at),
    delivered_at        = coalesce((v_timestamps->>'delivered_at')::timestamptz,        delivered_at)
  where id = p_order_id;

  -- Append audit event
  v_event_meta := jsonb_build_object(
    'from_stage',       v_from_stage,
    'to_stage',         p_to_stage,
    'actor_id',         p_actor_id,
    'metadata',         p_metadata,
    'transitioned_at',  v_now
  );

  insert into public.production_order_events
    (production_order_id, event_type, metadata)
  values
    (p_order_id, 'stage_transition', v_event_meta);

  return v_event_meta;
end;
$$;

comment on function public.transition_production_stage is
  'Atomic stage transition: updates production_stage + writes audit event in one transaction. '
  'Transition graph validation must be done by the caller before invoking this function.';

-- ─── 7. Rollback instructions (manual) ───────────────────────────────────────
-- To undo this migration:
--
--   drop function if exists public.transition_production_stage;
--   drop index if exists idx_production_orders_stage_updated;
--   drop index if exists idx_production_orders_stage;
--   alter table public.production_orders
--     drop column if exists revision_notes,
--     drop column if exists sample_delivered_at,
--     drop column if exists sample_shipped_at,
--     drop column if exists production_started_at,
--     drop column if exists production_stage;
--   drop type if exists public.production_stage;
--
-- =============================================================================
