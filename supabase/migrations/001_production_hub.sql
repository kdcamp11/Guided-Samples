-- =============================================================================
-- Migration 001: Production Hub foundation
-- =============================================================================
-- Applies on top of supabase/schema.sql (Design Studio baseline).
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO NOTHING).
-- Run in Supabase SQL editor or via `supabase db push`.
-- =============================================================================

-- ─── 1. Lock column on projects ──────────────────────────────────────────────
--
-- Once a production order is created from a design order, the design order
-- becomes immutable.  locked_at records the handoff timestamp; a non-null
-- value is the application-level signal that no further edits are permitted.
--
-- The application (lib/projects.ts saveProject / saveTechPack) must check
-- this column before writing.  The column itself does NOT use a DB trigger to
-- block writes — enforcement is in the service layer so that admin overrides
-- remain possible at the database level.

alter table public.projects
  add column if not exists locked_at timestamptz default null;

comment on column public.projects.locked_at is
  'Set when a production order is created. Signals the design order is immutable.';

-- ─── 2. Production order status enum ─────────────────────────────────────────

do $$ begin
  create type public.production_order_status as enum (
    'pending_payment',
    'paid',
    'in_production',
    'quality_check',
    'shipped',
    'delivered',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

-- ─── 3. production_orders table ──────────────────────────────────────────────

create table if not exists public.production_orders (
  id                    uuid        primary key default gen_random_uuid(),

  -- Link back to the originating design order (immutable after insert)
  design_order_id       uuid        not null
                          references public.projects(id)
                          on delete restrict,   -- prevent deleting a project that has a production order

  user_id               uuid        not null
                          references auth.users(id)
                          on delete cascade,

  status                public.production_order_status not null default 'pending_payment',

  -- ── Pricing snapshot (frozen at order creation) ───────────────────────────
  activation_fee_cents  integer     not null,
  garment_price_cents   integer     not null,
  extra_logo_count      integer     not null default 0 check (extra_logo_count >= 0),
  extra_logo_fee_cents  integer     not null default 0 check (extra_logo_fee_cents >= 0),
  total_cents           integer     not null
                          generated always as (
                            activation_fee_cents + garment_price_cents + extra_logo_fee_cents
                          ) stored,

  -- ── Tech pack snapshot (JSONB, immutable copy of tech_packs row) ─────────
  tech_pack_snapshot    jsonb       not null default '{}',

  -- ── Stripe ───────────────────────────────────────────────────────────────
  stripe_session_id     text        unique,
  stripe_payment_intent text        unique,

  -- ── Supplier / logistics ─────────────────────────────────────────────────
  supplier_name         text,
  supplier_email        text,
  supplier_notes        text,
  tracking_number       text,
  carrier               text,

  -- ── Timestamps ───────────────────────────────────────────────────────────
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  paid_at               timestamptz,
  shipped_at            timestamptz,
  delivered_at          timestamptz,

  -- ── Constraints ──────────────────────────────────────────────────────────
  -- One active production order per design order at a time
  -- (allows a new order after cancellation by excluding cancelled status)
  constraint unique_active_production_order
    exclude using btree (design_order_id with =)
    where (status <> 'cancelled')
);

comment on table public.production_orders is
  'Production orders created after Tech Pack approval. Linked 1:1 (active) to a design order.';
comment on column public.production_orders.design_order_id is
  'Immutable FK to projects. The referenced project.locked_at will be non-null.';
comment on column public.production_orders.tech_pack_snapshot is
  'JSONB copy of tech_packs at handoff time. Factory uses this; live tech_packs may diverge.';
comment on column public.production_orders.total_cents is
  'Computed: activation_fee_cents + garment_price_cents + extra_logo_fee_cents.';

-- ─── 4. production_order_events table (audit log) ────────────────────────────

create table if not exists public.production_order_events (
  id                    uuid        primary key default gen_random_uuid(),
  production_order_id   uuid        not null
                          references public.production_orders(id)
                          on delete cascade,
  event_type            text        not null,
  metadata              jsonb       not null default '{}',
  created_at            timestamptz not null default now()
);

comment on table public.production_order_events is
  'Append-only audit log for every status transition and notable event on a production order.';

-- ─── 5. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_production_orders_user_id
  on public.production_orders (user_id);

create index if not exists idx_production_orders_design_order_id
  on public.production_orders (design_order_id);

create index if not exists idx_production_orders_status
  on public.production_orders (status);

create index if not exists idx_production_order_events_order_id
  on public.production_order_events (production_order_id);

create index if not exists idx_production_order_events_created_at
  on public.production_order_events (created_at desc);

-- ─── 6. updated_at trigger ────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger trg_production_orders_updated_at
    before update on public.production_orders
    for each row execute procedure public.set_updated_at();
exception
  when duplicate_object then null;
end $$;

-- ─── 7. Row-level security ────────────────────────────────────────────────────

alter table public.production_orders       enable row level security;
alter table public.production_order_events enable row level security;

-- Users can read and create their own production orders
create policy if not exists "Users can manage their own production orders"
  on public.production_orders for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can read events for their own orders; events are insert-only from service
create policy if not exists "Users can read their own production order events"
  on public.production_order_events for select
  using (
    exists (
      select 1 from public.production_orders po
      where po.id = production_order_events.production_order_id
        and po.user_id = auth.uid()
    )
  );

create policy if not exists "Users can insert events for their own orders"
  on public.production_order_events for insert
  with check (
    exists (
      select 1 from public.production_orders po
      where po.id = production_order_events.production_order_id
        and po.user_id = auth.uid()
    )
  );

-- ─── 8. Rollback instructions (manual) ───────────────────────────────────────
-- To undo this migration:
--
--   drop table if exists public.production_order_events cascade;
--   drop table if exists public.production_orders cascade;
--   drop type  if exists public.production_order_status;
--   alter table public.projects drop column if exists locked_at;
--   drop function if exists public.set_updated_at();
--
-- =============================================================================
