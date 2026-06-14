# GRACE Enterprise — Database Migrations

## Baseline

The initial schema lives in `supabase/schema.sql`.  
Apply it once in the Supabase SQL editor to bootstrap a new project.

## Numbered migrations

Each migration in this folder is additive and idempotent  
(`IF NOT EXISTS`, `DO NOTHING`, `OR REPLACE`).

| File | Purpose |
|------|---------|
| `001_production_hub.sql` | Production Hub foundation — adds `locked_at` to `projects`, creates `production_orders` and `production_order_events` tables with RLS and indexes |

## Applying a migration

### Option A — Supabase SQL editor (recommended for hosted projects)
1. Open your project at supabase.com → SQL Editor
2. Paste the full contents of the migration file
3. Click **Run**

### Option B — Supabase CLI
```bash
supabase db push        # pushes all pending migrations to your linked project
```
Or for a one-off file:
```bash
supabase db execute --file supabase/migrations/001_production_hub.sql
```

## Rollback

Each migration file includes manual rollback SQL in a comment block at the  
bottom.  Supabase does not support automatic rollbacks.  Run the rollback  
statements in the SQL editor if you need to revert.

## Ordering rules

1. Always apply migrations in ascending numeric order.  
2. Never edit a migration that has already been applied to production.  
   Create a new numbered migration instead.  
3. The `set_updated_at()` trigger function is created by `001_production_hub.sql`.  
   Subsequent migrations can reuse it.
