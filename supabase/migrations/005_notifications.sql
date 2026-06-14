-- =============================================================================
-- Migration 005: Notification system
-- =============================================================================
-- Persistent in-app notifications + per-user email preferences.
-- Notifications are keyed by recipient_email (matching auth.email()) so both
-- brand owners (clients) and suppliers can query with the same RLS policy.
-- =============================================================================

-- ─── 1. Notification type enum ────────────────────────────────────────────────

create type public.notification_type as enum (
  'first_piece_ready',
  'revision_requested',
  'sample_shipped',
  'sample_delivered',
  'bulk_approved',
  'tracking_uploaded',
  'order_delivered',
  'order_cancelled',
  'qc_passed',
  'order_packed'
);

-- ─── 2. Notifications table ───────────────────────────────────────────────────

create table if not exists public.notifications (
  id                    uuid          primary key default gen_random_uuid(),
  production_order_id   uuid          references public.production_orders(id) on delete cascade,
  recipient_email       text          not null,
  type                  public.notification_type not null,
  title                 text          not null,
  body                  text          not null,
  is_read               boolean       not null default false,
  created_at            timestamptz   not null default now()
);

comment on table public.notifications is
  'In-app notifications for production order stage changes.';

alter table public.notifications enable row level security;

-- Each user sees only their own notifications (matched by login email)
create policy if not exists "Users can view their own notifications"
  on public.notifications for select
  using (recipient_email = auth.email());

create policy if not exists "Users can mark their own notifications as read"
  on public.notifications for update
  using (recipient_email = auth.email())
  with check (recipient_email = auth.email());

-- Server-side API routes (anon key, service role) insert notifications
-- The transition API runs as authenticated user; notifications are inserted
-- via service-role calls from the API route layer.
create policy if not exists "Service role can insert notifications"
  on public.notifications for insert
  with check (true);

-- ─── 3. Notification preferences ─────────────────────────────────────────────

create table if not exists public.notification_preferences (
  user_email            text          primary key,
  email_enabled         boolean       not null default true,
  -- Per-type email overrides stored as JSONB map of notification_type → bool
  -- Absence of a key means "use global email_enabled"
  email_overrides       jsonb         not null default '{}'::jsonb,
  updated_at            timestamptz   not null default now()
);

comment on table public.notification_preferences is
  'Per-user notification preferences. Queried before sending emails.';

alter table public.notification_preferences enable row level security;

create policy if not exists "Users can manage their own preferences"
  on public.notification_preferences for all
  using (user_email = auth.email())
  with check (user_email = auth.email());

create policy if not exists "Service role can upsert preferences"
  on public.notification_preferences for insert
  with check (true);

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_email, created_at desc)
  where is_read = false;

create index if not exists idx_notifications_order_id
  on public.notifications (production_order_id);

-- ─── 5. Realtime ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.notifications;

-- ─── Rollback ─────────────────────────────────────────────────────────────────
-- drop table if exists public.notification_preferences cascade;
-- drop table if exists public.notifications cascade;
-- drop type if exists public.notification_type;
