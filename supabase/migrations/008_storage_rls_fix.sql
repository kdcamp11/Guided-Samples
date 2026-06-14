-- Migration 008: Fix production-media storage RLS
-- The original policy in 003 used storage.foldername() which can be
-- unreliable depending on Supabase version.  Replace with a simpler
-- name-prefix check: path starts with "<orderId>/".

-- Ensure the bucket exists (idempotent)
insert into storage.buckets (id, name, public)
  values ('production-media', 'production-media', false)
  on conflict (id) do nothing;

-- Drop old policies so we can recreate them cleanly
drop policy if exists "Suppliers can upload production media"     on storage.objects;
drop policy if exists "Suppliers can read their own production media" on storage.objects;
drop policy if exists "Admins can read all production media"      on storage.objects;

-- Suppliers: INSERT — path must start with an orderId they are assigned to
create policy "Suppliers can upload production media"
  on storage.objects for insert
  with check (
    bucket_id = 'production-media'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.production_orders po
      where name like (po.id::text || '/%')
        and po.supplier_email = auth.email()
    )
  );

-- Suppliers + clients: SELECT
create policy "Suppliers can read their own production media"
  on storage.objects for select
  using (
    bucket_id = 'production-media'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.production_orders po
      where name like (po.id::text || '/%')
        and (po.supplier_email = auth.email() or po.user_id = auth.uid())
    )
  );

-- Admins: SELECT all
create policy "Admins can read all production media"
  on storage.objects for select
  using (
    bucket_id = 'production-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
