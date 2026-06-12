-- GRACE Enterprise — database schema
-- Compatible with Supabase (PostgreSQL 15+)
-- Run this in the Supabase SQL editor.
--
-- Supabase manages auth.users internally. This schema uses a `profiles`
-- table that references auth.users(id) — the standard Supabase pattern.

-- ─────────────────────────────────────────
-- Profiles (extends Supabase auth.users)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT,
  phone       TEXT,
  brand_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- Addresses
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  street     TEXT NOT NULL,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  zip        TEXT NOT NULL,
  country    TEXT NOT NULL DEFAULT 'US',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- ─────────────────────────────────────────
-- Design assets
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Untitled Logo',
  image_url  TEXT NOT NULL,
  svg_url    TEXT,
  style      TEXT,
  color      TEXT,
  prompt     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logos_user_id ON logos(user_id);

CREATE TABLE IF NOT EXISTS garments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Untitled Garment',
  image_url    TEXT NOT NULL,
  garment_type TEXT NOT NULL DEFAULT 'hoodie',
  color        TEXT,
  prompt       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garments_user_id ON garments(user_id);

CREATE TABLE IF NOT EXISTS designs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_id      UUID REFERENCES logos(id) ON DELETE SET NULL,
  garment_id   UUID REFERENCES garments(id) ON DELETE SET NULL,
  name         TEXT NOT NULL DEFAULT 'Untitled Design',
  canvas_json  JSONB,
  preview_url  TEXT,
  confirmed    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_designs_user_id ON designs(user_id);

CREATE TABLE IF NOT EXISTS previews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id  UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_previews_design_id ON previews(design_id);

-- ─────────────────────────────────────────
-- Tech Packs
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tech_packs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id  UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Untitled Tech Pack',
  pdf_url    TEXT,
  fields     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tech_packs_user_id   ON tech_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_packs_design_id ON tech_packs(design_id);

-- ─────────────────────────────────────────
-- Auto-update updated_at
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_designs_updated_at
  BEFORE UPDATE ON designs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_tech_packs_updated_at
  BEFORE UPDATE ON tech_packs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────
-- Row Level Security (enable but open for now)
-- Tighten these policies when auth is wired up.
-- ─────────────────────────────────────────

ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE garments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE previews   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_packs ENABLE ROW LEVEL SECURITY;

-- Temporary open policies — replace with auth.uid() checks when sign-in is live
CREATE POLICY "allow_all_profiles"   ON profiles   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_addresses"  ON addresses  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_logos"      ON logos      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_garments"   ON garments   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_designs"    ON designs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_previews"   ON previews   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tech_packs" ON tech_packs FOR ALL USING (true) WITH CHECK (true);
