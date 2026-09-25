-- ============================================================
-- AD4YOU — ALL-IN-ONE SETUP (run once in Supabase SQL Editor)
-- Contains every migration in dependency order.
-- Each section is idempotent: safe to run multiple times.
-- ============================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_FLEXIBLE_PLANS_AND_TIME_PACKAGES.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- AD4YOU — FLEXIBLE PLANS, PRICING & CUSTOM TIME-BASED PACKAGES
-- Safe to run multiple times in the Supabase SQL Editor.
-- Additive only: no data is deleted, nothing is dropped.
-- ============================================================

-- ---------- 1. Duration unit type ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duration_unit') THEN
    CREATE TYPE public.duration_unit AS ENUM ('minutes', 'hours', 'days', 'weeks', 'months');
  END IF;
END $$;

-- ---------- 2. plans: flexible duration + presentation fields ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration_value INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration_unit public.duration_unit DEFAULT 'days';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT false;

UPDATE public.plans SET title = name WHERE title IS NULL;
UPDATE public.plans SET currency = 'USD' WHERE currency IS NULL;
UPDATE public.plans
   SET duration_value = COALESCE(NULLIF(duration_days, 0), 30),
       duration_unit  = 'days'
 WHERE duration_value IS NULL;
UPDATE public.plans SET is_unlimited = true WHERE COALESCE(duration_days, 0) = 0 AND is_unlimited IS DISTINCT FROM true;

-- ---------- 3. plan_pricing_options: many price/duration options per plan ----------
CREATE TABLE IF NOT EXISTS public.plan_pricing_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  price           NUMERIC NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  duration_value  INTEGER NOT NULL DEFAULT 30,
  duration_unit   public.duration_unit NOT NULL DEFAULT 'days',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_popular      BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_pricing_options_plan_idx ON public.plan_pricing_options(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS plan_pricing_options_active_idx ON public.plan_pricing_options(is_active);

GRANT SELECT ON public.plan_pricing_options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_pricing_options TO authenticated;
GRANT ALL ON public.plan_pricing_options TO service_role;

ALTER TABLE public.plan_pricing_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_options_public_read" ON public.plan_pricing_options;
CREATE POLICY "pricing_options_public_read" ON public.plan_pricing_options
  FOR SELECT USING (is_active = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "pricing_options_admin_write" ON public.plan_pricing_options;
CREATE POLICY "pricing_options_admin_write" ON public.plan_pricing_options
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_pricing_options_updated_at ON public.plan_pricing_options;
CREATE TRIGGER trg_pricing_options_updated_at BEFORE UPDATE ON public.plan_pricing_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. subscriptions: frozen per-user package snapshot ----------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS package_title TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS duration_value INTEGER;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS duration_unit public.duration_unit DEFAULT 'days';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pricing_option_id UUID REFERENCES public.plan_pricing_options(id) ON DELETE SET NULL;

UPDATE public.subscriptions s
   SET duration_value = COALESCE(s.duration_value, NULLIF(s.duration_days, 0), 30),
       duration_unit  = COALESCE(s.duration_unit, 'days')
 WHERE s.duration_value IS NULL;

UPDATE public.subscriptions SET is_unlimited = true
 WHERE COALESCE(duration_days, 0) = 0 AND is_unlimited IS DISTINCT FROM true;

UPDATE public.subscriptions s
   SET package_title = p.title
  FROM public.plans p
 WHERE s.plan_id = p.id AND s.package_title IS NULL;

CREATE INDEX IF NOT EXISTS subscriptions_end_date_idx ON public.subscriptions(status, end_date);

-- ---------- 5. Expiry helpers (timestamp-exact, all units) ----------
CREATE OR REPLACE FUNCTION public.compute_expiry(
  _start TIMESTAMPTZ,
  _value INTEGER,
  _unit public.duration_unit
) RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _start + (_value::text || ' ' || _unit::text)::interval;
$$;

GRANT EXECUTE ON FUNCTION public.compute_expiry(TIMESTAMPTZ, INTEGER, public.duration_unit)
  TO anon, authenticated, service_role;

-- Extend the EXISTING auto-expiry job so it also expires minute/hour packages.
CREATE OR REPLACE FUNCTION public.expire_overdue_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
     SET status = 'expired'
   WHERE status = 'active'
     AND COALESCE(is_unlimited, COALESCE(duration_days, 0) = 0) = false
     AND end_date < now();
END; $$;

-- Keep expiry consistent whenever a subscription row is written.
CREATE OR REPLACE FUNCTION public.sync_subscription_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NULL THEN NEW.start_date := now(); END IF;

  IF COALESCE(NEW.is_unlimited, false) THEN
    NEW.end_date := '2099-12-31T23:59:59Z'::timestamptz;
    NEW.duration_days := 0;
  ELSE
    IF NEW.duration_value IS NULL THEN
      NEW.duration_value := COALESCE(NULLIF(NEW.duration_days, 0), 30);
      NEW.duration_unit := COALESCE(NEW.duration_unit, 'days');
    END IF;
    NEW.duration_unit := COALESCE(NEW.duration_unit, 'days');
    NEW.end_date := public.compute_expiry(NEW.start_date, NEW.duration_value, NEW.duration_unit);
    NEW.duration_days := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (NEW.end_date - NEW.start_date)) / 86400)::int
    );
  END IF;

  IF NEW.status = 'active' AND NEW.end_date < now() THEN
    NEW.status := 'expired';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_subscriptions_sync_expiry ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_sync_expiry
  BEFORE INSERT OR UPDATE OF start_date, duration_value, duration_unit, is_unlimited, duration_days
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_expiry();

-- ---------- 6. Realtime ----------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_pricing_options;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.plans REPLICA IDENTITY FULL;
ALTER TABLE public.plan_pricing_options REPLICA IDENTITY FULL;

-- ---------- 7. Reload API schema cache ----------
NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_PART2_PLAN_DATABASE.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- AD4YOU — PART 2: PLAN DATABASE (Starter / Pro / Business / Agency)
-- Safe to run multiple times in the Supabase SQL Editor.
-- Additive only: no rows are deleted, nothing is dropped.
-- Requires AD4YOU_FLEXIBLE_PLANS_AND_TIME_PACKAGES.sql to be applied first.
-- ============================================================

-- ---------- 1. Admin-editable team capacity ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_team_members INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS capacity_note TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS position_label TEXT;

-- ---------- 2. Canonical four plans (create if missing, preserve if present) ----------
DO $$
DECLARE
  r RECORD;
  v_id UUID;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('starter',  'Starter',  'For small teams',            20,   'A focused start',    35.00, 1, '#22c55e', false),
      ('pro',      'Pro',      'For growing teams',          50,   'Built for momentum', 60.00, 2, '#3b82f6', false),
      ('business', 'Business', 'For scaling operations',     200,  'Room to scale',      120.00, 3, '#a855f7', true),
      ('agency',   'Agency',   'For large-scale operations', 1000, 'Enterprise capacity',250.00, 4, '#f59e0b', false)
    ) AS t(slug, name, position_label, capacity, capacity_note, price, sort_order, color, is_popular)
  LOOP
    SELECT id INTO v_id
      FROM public.plans
     WHERE lower(slug) = r.slug
     ORDER BY created_at NULLS FIRST
     LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.plans (
        name, title, slug, description, price, currency,
        duration_days, duration_value, duration_unit,
        is_free, is_active, is_popular, color, sort_order,
        max_team_members, capacity_note, position_label
      ) VALUES (
        r.name, r.name, r.slug, r.position_label, r.price, 'USD',
        30, 30, 'days',
        false, true, r.is_popular, r.color, r.sort_order,
        r.capacity, r.capacity_note, r.position_label
      );
    ELSE
      -- Only fill what is empty; never overwrite admin-edited values.
      UPDATE public.plans SET
        title            = COALESCE(title, r.name),
        currency         = COALESCE(currency, 'USD'),
        max_team_members = COALESCE(max_team_members, r.capacity),
        capacity_note    = COALESCE(capacity_note, r.capacity_note),
        position_label   = COALESCE(position_label, r.position_label),
        color            = COALESCE(color, r.color),
        sort_order       = COALESCE(sort_order, r.sort_order),
        is_active        = true
      WHERE id = v_id;
    END IF;
  END LOOP;
END $$;

-- ---------- 3. Duplicate / legacy cleanup (deactivate, never delete) ----------
-- 3a. Duplicate rows that share a canonical slug: keep the oldest, hide the rest.
WITH ranked AS (
  SELECT id, lower(slug) AS s,
         ROW_NUMBER() OVER (PARTITION BY lower(slug) ORDER BY created_at NULLS FIRST, id) AS rn
    FROM public.plans
   WHERE lower(slug) IN ('starter', 'pro', 'business', 'agency')
)
UPDATE public.plans p
   SET is_active = false, is_popular = false
  FROM ranked
 WHERE p.id = ranked.id AND ranked.rn > 1;

-- 3b. Legacy / duplicated Business & Agency style packages under other slugs.
UPDATE public.plans
   SET is_active = false, is_popular = false
 WHERE lower(slug) NOT IN ('starter', 'pro', 'business', 'agency')
   AND COALESCE(is_free, false) = false
   AND (
        lower(COALESCE(name, ''))  ~ '(business|agency)'
     OR lower(COALESCE(title, '')) ~ '(business|agency)'
     OR lower(slug)                ~ '(business|agency)'
   );

-- ---------- 4. 30 / 60 / 90 day pricing options (admin can edit / add more) ----------
DO $$
DECLARE
  r RECORD;
  v_id UUID;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('starter',  30, 35.00,  1, false),
      ('starter',  60, 65.00,  2, false),
      ('starter',  90, 90.00,  3, false),
      ('pro',      30, 60.00,  1, false),
      ('pro',      60, 110.00, 2, true),
      ('pro',      90, 155.00, 3, false),
      ('business', 30, 120.00, 1, false),
      ('business', 60, 220.00, 2, true),
      ('business', 90, 315.00, 3, false),
      ('agency',   30, 250.00, 1, false),
      ('agency',   60, 450.00, 2, false),
      ('agency',   90, 625.00, 3, false)
    ) AS t(slug, days, price, sort_order, is_popular)
  LOOP
    SELECT id INTO v_id
      FROM public.plans
     WHERE lower(slug) = r.slug AND is_active = true
     ORDER BY created_at NULLS FIRST
     LIMIT 1;

    IF v_id IS NULL THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.plan_pricing_options
       WHERE plan_id = v_id AND duration_unit = 'days' AND duration_value = r.days
    ) THEN
      INSERT INTO public.plan_pricing_options
        (plan_id, label, price, currency, duration_value, duration_unit, is_active, is_popular, sort_order)
      VALUES
        (v_id, r.days || ' Days', r.price, 'USD', r.days, 'days', true, r.is_popular, r.sort_order);
    END IF;
  END LOOP;
END $$;

-- ---------- 5. Realtime + schema cache ----------
ALTER TABLE public.plans REPLICA IDENTITY FULL;
ALTER TABLE public.plan_pricing_options REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.plans; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_pricing_options; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------- 6. Verification ----------
-- SELECT slug, name, max_team_members, is_active, sort_order FROM public.plans ORDER BY sort_order;
-- SELECT p.slug, o.label, o.price, o.duration_value, o.duration_unit, o.is_active
--   FROM public.plan_pricing_options o JOIN public.plans p ON p.id = o.plan_id
--  ORDER BY p.sort_order, o.sort_order;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_PART4_EXTRA_PC_CAPACITY.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- AD4YOU — PART 4: EXTRA PC CAPACITY (ADD-ONS)
-- Safe to run multiple times in the Supabase SQL Editor.
-- Additive only: nothing is dropped, no data is deleted.
-- Requires: AD4YOU_FLEXIBLE_PLANS_AND_TIME_PACKAGES.sql
--           AD4YOU_PART2_PLAN_DATABASE.sql
-- ============================================================

-- ---------- 1. Keep both capacity columns in sync ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_pcs INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_team_members INTEGER;

UPDATE public.plans SET max_team_members = max_pcs
 WHERE max_team_members IS NULL AND max_pcs IS NOT NULL;
UPDATE public.plans SET max_pcs = max_team_members
 WHERE max_pcs IS NULL AND max_team_members IS NOT NULL;

-- ---------- 2. Extra PC capacity add-ons ----------
CREATE TABLE IF NOT EXISTS public.capacity_addons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extra_pcs    INTEGER NOT NULL DEFAULT 0,
  price        NUMERIC NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  label        TEXT,
  note         TEXT,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means: follows the user's current subscription expiry
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT NOT NULL DEFAULT 'admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capacity_addons_user_idx   ON public.capacity_addons(user_id, is_active);
CREATE INDEX IF NOT EXISTS capacity_addons_expiry_idx ON public.capacity_addons(expires_at);

GRANT SELECT ON public.capacity_addons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.capacity_addons TO authenticated;
GRANT ALL ON public.capacity_addons TO service_role;

ALTER TABLE public.capacity_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capacity_addons_read_own_or_admin" ON public.capacity_addons;
CREATE POLICY "capacity_addons_read_own_or_admin" ON public.capacity_addons
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_insert" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_insert" ON public.capacity_addons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_update" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_update" ON public.capacity_addons
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_delete" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_delete" ON public.capacity_addons
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_capacity_addons_updated_at ON public.capacity_addons;
CREATE TRIGGER trg_capacity_addons_updated_at BEFORE UPDATE ON public.capacity_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. Realtime ----------
ALTER TABLE public.capacity_addons REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.capacity_addons;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ---------- 4. Reload API schema cache ----------
NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_PART6_PRICING_SOURCE_OF_TRUTH.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- AD4YOU — PART 6: PRICING SOURCE OF TRUTH
-- Safe to run multiple times. Additive only. Nothing is dropped or deleted.
-- Requires: AD4YOU_FLEXIBLE_PLANS_AND_TIME_PACKAGES.sql
--           AD4YOU_PART2_PLAN_DATABASE.sql
--           AD4YOU_PART4_EXTRA_PC_CAPACITY.sql
-- Purpose: the extra-PC prices shown on the public pricing page and used as
-- admin presets now live in the database instead of the frontend code.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.capacity_packages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT,
  extra_pcs  INTEGER NOT NULL DEFAULT 0,
  price      NUMERIC NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'USD',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capacity_packages_active_idx ON public.capacity_packages(is_active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS capacity_packages_extra_uidx ON public.capacity_packages(extra_pcs);

GRANT SELECT ON public.capacity_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_packages TO authenticated;
GRANT ALL ON public.capacity_packages TO service_role;

ALTER TABLE public.capacity_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capacity_packages_public_read" ON public.capacity_packages;
CREATE POLICY "capacity_packages_public_read" ON public.capacity_packages
  FOR SELECT USING (is_active = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_packages_admin_write" ON public.capacity_packages;
CREATE POLICY "capacity_packages_admin_write" ON public.capacity_packages
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_capacity_packages_updated_at ON public.capacity_packages;
CREATE TRIGGER trg_capacity_packages_updated_at BEFORE UPDATE ON public.capacity_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the three current add-on sizes once; admin can edit / add / disable later.
INSERT INTO public.capacity_packages (label, extra_pcs, price, currency, is_active, sort_order)
SELECT v.label, v.extra_pcs, v.price, 'USD', true, v.sort_order
FROM (VALUES
  ('+100 PCs', 100, 30.00, 1),
  ('+200 PCs', 200, 60.00, 2),
  ('+300 PCs', 300, 90.00, 3)
) AS v(label, extra_pcs, price, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.capacity_packages c WHERE c.extra_pcs = v.extra_pcs
);

-- Live updates so price edits appear instantly everywhere.
ALTER TABLE public.capacity_packages REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.capacity_packages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.plans; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_pricing_options; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------- Verification ----------
-- SELECT slug, name, price, currency, duration_value, duration_unit, max_team_members, is_active
--   FROM public.plans ORDER BY sort_order;
-- SELECT p.slug, o.label, o.price, o.duration_value, o.duration_unit, o.is_active
--   FROM public.plan_pricing_options o JOIN public.plans p ON p.id = o.plan_id
--  ORDER BY p.sort_order, o.sort_order;
-- SELECT * FROM public.capacity_packages ORDER BY sort_order;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_INSTANT_JOIN_AND_OFFERS.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — 1) Discount offers: live activation + public visibility
--          2) Team instant join link (WhatsApp-style share & join)
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
-- ============================================================================

-- ── 1) DISCOUNT OFFERS ──────────────────────────────────────────────────────
-- New offers must be ACTIVE by default and visible to logged-out visitors.
ALTER TABLE public.discount_offers
  ALTER COLUMN is_active SET DEFAULT TRUE;

UPDATE public.discount_offers SET is_active = TRUE WHERE is_active IS NULL;
ALTER TABLE public.discount_offers ALTER COLUMN is_active SET NOT NULL;

-- Seat decay must never start "in the past" for brand new offers
ALTER TABLE public.discount_offers ALTER COLUMN last_decay_at SET DEFAULT now();
UPDATE public.discount_offers SET last_decay_at = COALESCE(last_decay_at, now());

-- Data API access (RLS still decides what is visible)
GRANT SELECT ON public.discount_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_offers TO authenticated;
GRANT ALL ON public.discount_offers TO service_role;

ALTER TABLE public.discount_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers public read active" ON public.discount_offers;
CREATE POLICY "offers public read active" ON public.discount_offers
  FOR SELECT TO anon, authenticated
  USING (
    (is_active = TRUE
      AND seats_remaining > 0
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at   IS NULL OR ends_at   >  now()))
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "offers admin write"  ON public.discount_offers;
DROP POLICY IF EXISTS "offers admin update" ON public.discount_offers;
DROP POLICY IF EXISTS "offers admin delete" ON public.discount_offers;
CREATE POLICY "offers admin write"  ON public.discount_offers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin update" ON public.discount_offers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin delete" ON public.discount_offers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Realtime so the pricing page reacts the moment an offer is created/toggled
ALTER TABLE public.discount_offers REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.discount_offers;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

-- ── 2) INSTANT JOIN LINK ────────────────────────────────────────────────────
ALTER TABLE public.team_join_forms
  ADD COLUMN IF NOT EXISTS instant_join_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS instant_join_role    TEXT    NOT NULL DEFAULT 'runner',
  ADD COLUMN IF NOT EXISTS instant_join_message TEXT;

DO $$ BEGIN
  ALTER TABLE public.team_join_forms
    ADD CONSTRAINT team_join_forms_instant_role_chk
    CHECK (instant_join_role IN ('editor','runner','viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Members created from the invite link already own their password
ALTER TABLE public.team_members
  ALTER COLUMN must_set_password SET DEFAULT FALSE;

-- One AD4YOU identity per email address, across every team
CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_unique_ci
  ON public.team_members (lower(email));

CREATE INDEX IF NOT EXISTS idx_join_forms_slug ON public.team_join_forms (lower(slug));

-- ── 3) Reload the API schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_MULTI_DOWNLOAD_OPTIONS.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- AD4YOU — complete multiple software downloads manager
-- Safe to run more than once. Existing rows and links are preserved.

CREATE TABLE IF NOT EXISTS public.bot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  platform TEXT DEFAULT 'windows',
  version TEXT NOT NULL,
  download_url TEXT,
  release_notes TEXT,
  file_size TEXT,
  is_latest BOOLEAN DEFAULT FALSE,
  is_mandatory BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'windows';
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS release_notes TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS file_size TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT FALSE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.bot_versions
SET title = 'AD4YOU for ' || INITCAP(COALESCE(NULLIF(platform, ''), 'Windows')) ||
  CASE WHEN COALESCE(version, '') <> '' THEN ' — v' || version ELSE '' END
WHERE title IS NULL OR btrim(title) = '';

CREATE INDEX IF NOT EXISTS bot_versions_active_order_idx
  ON public.bot_versions (is_active, sort_order, created_at DESC);

GRANT SELECT ON public.bot_versions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bot_versions TO authenticated;
GRANT ALL ON public.bot_versions TO service_role;

ALTER TABLE public.bot_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read bot versions" ON public.bot_versions;
DROP POLICY IF EXISTS "Authenticated read bot versions" ON public.bot_versions;
DROP POLICY IF EXISTS "Public read active bot versions" ON public.bot_versions;
CREATE POLICY "Public read active bot versions"
  ON public.bot_versions FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage bot versions" ON public.bot_versions;
CREATE POLICY "Admin manage bot versions"
  ON public.bot_versions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.bot_versions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bot_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_versions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_AFFILIATE_MIGRATION.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================================
-- AD4YOU — AFFILIATE / PAYOUT PRODUCTION MIGRATION  (idempotent, safe to re-run)
-- Run ONCE in your live project's SQL editor.
--
-- Creates:
--   public.user_payout_methods     per-user payout destinations
--   public.affiliate_referrals     who referred whom + commission
--   public.affiliate_withdrawals   withdrawal requests + release history
--   public.affiliate_settings      admin-tunable affiliate config (typed key/value)
--   username-style referral codes on public.users
--   30% instant commission trigger on confirmed payments
--   full RLS + GRANTs + indexes + updated_at triggers
-- =====================================================================================

-- ------------------------------------------------------------------ 0. prerequisites
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- is_admin() helper (security definer => no RLS recursion)
-- NOTE: never CREATE OR REPLACE this blindly — an existing is_admin(uuid) may use a
-- different parameter name (e.g. "user_id"), and Postgres refuses to rename it (42P13).
-- Policies call it positionally, so we simply keep whatever signature already exists.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
      AND p.pronargs = 1 AND p.proargtypes[0] = 'uuid'::regtype
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.is_admin(_user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
        SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
      $body$;
    $f$;
  END IF;
END
$do$;

-- ------------------------------------------------------- 1. referral codes on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key
  ON public.users (referral_code) WHERE referral_code IS NOT NULL;

-- username + 4 digits, e.g. "nadeem4821"
CREATE OR REPLACE FUNCTION public.generate_referral_code(_email text, _full_name text)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE base text; candidate text; i int := 0;
BEGIN
  base := lower(regexp_replace(COALESCE(NULLIF(_full_name, ''), split_part(_email, '@', 1), 'ad4you'), '[^a-zA-Z0-9]', '', 'g'));
  IF length(base) < 3 THEN base := 'ad4you'; END IF;
  base := substr(base, 1, 12);
  LOOP
    candidate := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = candidate);
    i := i + 1;
    EXIT WHEN i > 20;
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN
    NEW.referral_code := public.generate_referral_code(NEW.email, NEW.full_name);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_users_referral_code ON public.users;
CREATE TRIGGER trg_users_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- backfill existing users (missing or UUID-style codes)
UPDATE public.users u
SET referral_code = public.generate_referral_code(u.email, u.full_name)
WHERE u.referral_code IS NULL OR u.referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- ------------------------------------------------------------ 2. user_payout_methods
CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,                      -- wire_bank | bank | paypal | payoneer | crypto
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_payout_methods ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_payout_methods ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.user_payout_methods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods TO authenticated;
GRANT ALL ON public.user_payout_methods TO service_role;
ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout own" ON public.user_payout_methods;
CREATE POLICY "payout own" ON public.user_payout_methods
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "payout admin read" ON public.user_payout_methods;
CREATE POLICY "payout admin read" ON public.user_payout_methods
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx ON public.user_payout_methods(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_payout_methods_one_default
  ON public.user_payout_methods(user_id) WHERE is_default;

DROP TRIGGER IF EXISTS user_payout_methods_updated_at ON public.user_payout_methods;
CREATE TRIGGER user_payout_methods_updated_at BEFORE UPDATE ON public.user_payout_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------ 3. affiliate_referrals
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_email    TEXT,
  status            TEXT NOT NULL DEFAULT 'free',   -- free | premium
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  activated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_referrals_no_self CHECK (referrer_id <> referred_id),
  CONSTRAINT affiliate_referrals_referred_unique UNIQUE (referred_id)  -- one referrer per user, no repeat credit
);

GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals own read" ON public.affiliate_referrals;
CREATE POLICY "referrals own read" ON public.affiliate_referrals
  FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR referred_id = auth.uid());
DROP POLICY IF EXISTS "referrals admin all" ON public.affiliate_referrals;
CREATE POLICY "referrals admin all" ON public.affiliate_referrals
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS affiliate_referrals_referrer_idx ON public.affiliate_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_status_idx   ON public.affiliate_referrals(status);

-- --------------------------------------------------------- 4. affiliate_withdrawals
CREATE TABLE IF NOT EXISTS public.affiliate_withdrawals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method         TEXT NOT NULL,
  method_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | completed | rejected
  admin_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ
);

GRANT SELECT, INSERT ON public.affiliate_withdrawals TO authenticated;
GRANT ALL ON public.affiliate_withdrawals TO service_role;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals own read" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals own read" ON public.affiliate_withdrawals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "withdrawals own insert" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals own insert" ON public.affiliate_withdrawals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS "withdrawals admin all" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals admin all" ON public.affiliate_withdrawals
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS affiliate_withdrawals_user_idx   ON public.affiliate_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_status_idx ON public.affiliate_withdrawals(status);

-- ------------------------------------------------------------- 5. affiliate_settings
CREATE TABLE IF NOT EXISTS public.affiliate_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  label       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.affiliate_settings TO authenticated, anon;
GRANT ALL ON public.affiliate_settings TO service_role;
ALTER TABLE public.affiliate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate settings read" ON public.affiliate_settings;
CREATE POLICY "affiliate settings read" ON public.affiliate_settings
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "affiliate settings admin write" ON public.affiliate_settings;
CREATE POLICY "affiliate settings admin write" ON public.affiliate_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS affiliate_settings_updated_at ON public.affiliate_settings;
CREATE TRIGGER affiliate_settings_updated_at BEFORE UPDATE ON public.affiliate_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.affiliate_settings (key, value, label, description) VALUES
  ('affiliate_commission_percent', '30',   'Commission %',            'Percent of the first premium payment credited to the referrer.'),
  ('affiliate_min_withdrawal',     '100',  'Minimum withdrawal ($)',  'Balance required before a member can request a payout.'),
  ('affiliate_lock_payout_methods','true', 'Lock payout methods',     'Hide payout methods until the minimum balance is reached.')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------- 6. instant 30% commission on premium payment
CREATE OR REPLACE FUNCTION public.award_referral_commission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pct NUMERIC := 30; ref RECORD;
BEGIN
  IF NEW.status <> 'confirmed' OR COALESCE(NEW.amount, 0) <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.affiliate_referrals
   WHERE referred_id = NEW.user_id AND status <> 'premium' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;   -- no referrer, or already paid (no repeat commission)

  SELECT COALESCE(NULLIF(value, '')::numeric, 30) INTO pct
    FROM public.affiliate_settings WHERE key = 'affiliate_commission_percent';

  UPDATE public.affiliate_referrals
     SET status = 'premium',
         commission_amount = round(NEW.amount * COALESCE(pct, 30) / 100.0, 2),
         activated_at = now()
   WHERE id = ref.id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_referral_commission ON public.payments;
CREATE TRIGGER trg_award_referral_commission
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.award_referral_commission();

-- ------------------------------------------------------------------- 7. cache reload
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------- 8. admin page enable/disable flags
INSERT INTO public.settings (key, value, type, label, description) VALUES
  ('page_location_enabled',  'true', 'boolean', 'Location Page',           'Show or hide /location for users'),
  ('page_pricing_enabled',   'true', 'boolean', 'Pricing Page',            'Show or hide /pricing for users'),
  ('page_download_enabled',  'true', 'boolean', 'Download Bot Page',       'Show or hide /download for users'),
  ('page_affiliate_enabled', 'true', 'boolean', 'Affiliate Program Page',  'Show or hide /affiliate for users'),
  ('page_reviews_enabled',   'true', 'boolean', 'Reviews Page',            'Show or hide /reviews for users'),
  ('page_about_enabled',     'true', 'boolean', 'About Page',              'Show or hide /about for users'),
  ('page_contact_enabled',   'true', 'boolean', 'Contact Page',            'Show or hide /contact for users')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_AFFILIATE_CORE.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — AFFILIATE SYSTEM + PACKAGE INFO ARTICLES
-- FINAL, IDEMPOTENT, SAFE TO RUN TOP-TO-BOTTOM (multiple times) IN SQL EDITOR
-- ============================================================================

-- ---------------------------------------------------------------- 0. HELPERS
-- Keep whatever is_admin(uuid) signature already exists (policies call it
-- positionally). Only create it when missing — never rename its parameter.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
      AND p.pronargs = 1 AND p.proargtypes[0] = 'uuid'::regtype
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.is_admin(_user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
        SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
      $body$;
    $f$;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- users.referral_code = the user's OWN affiliate username (unique)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key ON public.users (lower(referral_code));

-- ------------------------------------------------------------ 1. CORE TABLES
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_email text,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free','premium')),
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_referrals_no_self CHECK (referrer_id <> referred_id),
  CONSTRAINT affiliate_referrals_referred_unique UNIQUE (referred_id)
);
CREATE INDEX IF NOT EXISTS affiliate_referrals_referrer_idx ON public.affiliate_referrals (referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('wire_bank','bank','paypal','payoneer','crypto')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx ON public.user_payout_methods (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.affiliate_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  method_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_user_idx ON public.affiliate_withdrawals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.affiliate_settings (key, value) VALUES
  ('affiliate_min_withdrawal', '100'),
  ('affiliate_commission_percent', '30'),
  ('affiliate_lock_payout_methods', 'true')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------- 2. PACKAGE INFO ARTICLES (CMS)
CREATE TABLE IF NOT EXISTS public.plan_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_slug text NOT NULL UNIQUE,
  emoji text,
  title text NOT NULL,
  subtitle text,
  hero_image_url text,
  content text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS plan_articles_touch ON public.plan_articles;
CREATE TRIGGER plan_articles_touch BEFORE UPDATE ON public.plan_articles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------- 3. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_referrals   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_withdrawals TO authenticated;
GRANT SELECT                          ON public.affiliate_settings   TO authenticated, anon;
GRANT SELECT                          ON public.plan_articles        TO authenticated, anon;
GRANT ALL ON public.affiliate_referrals, public.user_payout_methods,
             public.affiliate_withdrawals, public.affiliate_settings,
             public.plan_articles TO service_role;

-- -------------------------------------------------------------------- 4. RLS
ALTER TABLE public.affiliate_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payout_methods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_articles         ENABLE ROW LEVEL SECURITY;

-- affiliate_referrals ------------------------------------------------------
DROP POLICY IF EXISTS "referrals: own or referred read" ON public.affiliate_referrals;
CREATE POLICY "referrals: own or referred read" ON public.affiliate_referrals
FOR SELECT TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "referrals: admin write" ON public.affiliate_referrals;
CREATE POLICY "referrals: admin write" ON public.affiliate_referrals
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_payout_methods -----------------------------------------------------
DROP POLICY IF EXISTS "payout methods: own read" ON public.user_payout_methods;
CREATE POLICY "payout methods: own read" ON public.user_payout_methods
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "payout methods: own insert" ON public.user_payout_methods;
CREATE POLICY "payout methods: own insert" ON public.user_payout_methods
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "payout methods: own update" ON public.user_payout_methods;
CREATE POLICY "payout methods: own update" ON public.user_payout_methods
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "payout methods: own delete" ON public.user_payout_methods;
CREATE POLICY "payout methods: own delete" ON public.user_payout_methods
FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- affiliate_withdrawals ---------------------------------------------------
DROP POLICY IF EXISTS "withdrawals: own read" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: own read" ON public.affiliate_withdrawals
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals: own request" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: own request" ON public.affiliate_withdrawals
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND amount > 0);

-- Only admins may change status / release money.
DROP POLICY IF EXISTS "withdrawals: admin update" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: admin update" ON public.affiliate_withdrawals
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals: admin delete" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: admin delete" ON public.affiliate_withdrawals
FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- affiliate_settings ------------------------------------------------------
DROP POLICY IF EXISTS "affiliate settings: read" ON public.affiliate_settings;
CREATE POLICY "affiliate settings: read" ON public.affiliate_settings
FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "affiliate settings: admin write" ON public.affiliate_settings;
CREATE POLICY "affiliate settings: admin write" ON public.affiliate_settings
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- plan_articles -----------------------------------------------------------
DROP POLICY IF EXISTS "plan articles: public read published" ON public.plan_articles;
CREATE POLICY "plan articles: public read published" ON public.plan_articles
FOR SELECT TO anon, authenticated USING (is_published = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "plan articles: admin write" ON public.plan_articles;
CREATE POLICY "plan articles: admin write" ON public.plan_articles
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------- 5. AUTOMATIC REFERRAL CODE + LINKING
-- Username-style affiliate code, e.g. nadeem4821
CREATE OR REPLACE FUNCTION public.generate_referral_code(_email text, _name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; i int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(nullif(_name,''), split_part(coalesce(_email,'ad4you'),'@',1)), '[^a-zA-Z0-9]', '', 'g'));
  IF length(base) < 3 THEN base := 'ad4you'; END IF;
  base := left(base, 12);
  LOOP
    candidate := base || lpad((floor(random()*10000))::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE lower(referral_code) = candidate);
    i := i + 1;
    EXIT WHEN i > 10;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Fires on public.users rows created by your existing handle_new_user trigger.
-- 1) gives every user their own username-style referral code
-- 2) records the invite (auth metadata `referred_by`) as a FREE referral
CREATE OR REPLACE FUNCTION public.affiliate_on_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite text; ref_id uuid;
BEGIN
  IF NEW.referral_code IS NULL
     OR NEW.referral_code = ''
     OR NEW.referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
  THEN
    UPDATE public.users
       SET referral_code = public.generate_referral_code(NEW.email, NEW.full_name)
     WHERE id = NEW.id;
  END IF;

  SELECT coalesce(raw_user_meta_data->>'referred_by', raw_user_meta_data->>'ref')
    INTO invite
    FROM auth.users WHERE id = NEW.id;

  IF invite IS NOT NULL AND length(invite) >= 3 THEN
    SELECT id INTO ref_id FROM public.users WHERE lower(referral_code) = lower(invite) LIMIT 1;
    IF ref_id IS NULL AND invite ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO ref_id FROM public.users WHERE id = invite::uuid;
    END IF;
    IF ref_id IS NOT NULL AND ref_id <> NEW.id THEN
      INSERT INTO public.affiliate_referrals (referrer_id, referred_id, referred_email, status)
      VALUES (ref_id, NEW.id, NEW.email, 'free')
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS affiliate_on_new_user_trg ON public.users;
CREATE TRIGGER affiliate_on_new_user_trg AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_new_user();

-- Backfill codes for existing users
UPDATE public.users
   SET referral_code = public.generate_referral_code(email, full_name)
 WHERE referral_code IS NULL
    OR referral_code = ''
    OR referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- ---------------------------------------- 6. COMMISSION ON PREMIUM UPGRADE
-- When a payment is confirmed/completed, the referral flips to PREMIUM and the
-- referrer earns the configured commission percent of the paid amount.
CREATE OR REPLACE FUNCTION public.affiliate_award_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pct numeric; paid numeric;
BEGIN
  IF lower(coalesce(NEW.status,'')) NOT IN ('confirmed','completed','finished','paid') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(value,'')::numeric, 30) INTO pct
    FROM public.affiliate_settings WHERE key = 'affiliate_commission_percent';
  pct := coalesce(pct, 30);
  paid := coalesce(NEW.amount, 0);

  UPDATE public.affiliate_referrals
     SET status = 'premium',
         commission_amount = round(paid * pct / 100.0, 2),
         activated_at = coalesce(activated_at, now())
   WHERE referred_id = NEW.user_id
     AND status <> 'premium';

  RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='payments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS affiliate_award_commission_trg ON public.payments';
    EXECUTE 'CREATE TRIGGER affiliate_award_commission_trg
             AFTER INSERT OR UPDATE OF status ON public.payments
             FOR EACH ROW EXECUTE FUNCTION public.affiliate_award_commission()';
  END IF;
END
$do$;

-- Realtime (safe if already added)
DO $do$
BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_referrals'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_withdrawals'; EXCEPTION WHEN others THEN NULL; END;
END
$do$;

-- ------------------------------------------------------- 7. RELOAD API CACHE
-- Fixes "Could not find the table 'public.user_payout_methods' in the schema cache"
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- DONE. No data deleted. Safe to re-run.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_AFFILIATE_RLS_FINAL.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — AFFILIATE SYSTEM + PACKAGE INFO ARTICLES
-- FINAL, IDEMPOTENT, SAFE TO RUN TOP-TO-BOTTOM (multiple times) IN SQL EDITOR
-- ============================================================================

-- ---------------------------------------------------------------- 0. HELPERS
-- Keep whatever is_admin(uuid) signature already exists (policies call it
-- positionally). Only create it when missing — never rename its parameter.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
      AND p.pronargs = 1 AND p.proargtypes[0] = 'uuid'::regtype
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.is_admin(_user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
        SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
      $body$;
    $f$;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- users.referral_code = the user's OWN affiliate username (unique)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key ON public.users (lower(referral_code));

-- ------------------------------------------------------------ 1. CORE TABLES
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_email text,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free','premium')),
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_referrals_no_self CHECK (referrer_id <> referred_id),
  CONSTRAINT affiliate_referrals_referred_unique UNIQUE (referred_id)
);
CREATE INDEX IF NOT EXISTS affiliate_referrals_referrer_idx ON public.affiliate_referrals (referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('wire_bank','bank','paypal','payoneer','crypto')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx ON public.user_payout_methods (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.affiliate_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  method_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_user_idx ON public.affiliate_withdrawals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.affiliate_settings (key, value) VALUES
  ('affiliate_min_withdrawal', '100'),
  ('affiliate_commission_percent', '30'),
  ('affiliate_lock_payout_methods', 'true')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------- 2. PACKAGE INFO ARTICLES (CMS)
CREATE TABLE IF NOT EXISTS public.plan_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_slug text NOT NULL UNIQUE,
  emoji text,
  title text NOT NULL,
  subtitle text,
  hero_image_url text,
  content text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS plan_articles_touch ON public.plan_articles;
CREATE TRIGGER plan_articles_touch BEFORE UPDATE ON public.plan_articles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------- 3. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_referrals   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_withdrawals TO authenticated;
GRANT SELECT                          ON public.affiliate_settings   TO authenticated, anon;
GRANT SELECT                          ON public.plan_articles        TO authenticated, anon;
GRANT ALL ON public.affiliate_referrals, public.user_payout_methods,
             public.affiliate_withdrawals, public.affiliate_settings,
             public.plan_articles TO service_role;

-- -------------------------------------------------------------------- 4. RLS
ALTER TABLE public.affiliate_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payout_methods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_articles         ENABLE ROW LEVEL SECURITY;

-- affiliate_referrals ------------------------------------------------------
DROP POLICY IF EXISTS "referrals: own or referred read" ON public.affiliate_referrals;
CREATE POLICY "referrals: own or referred read" ON public.affiliate_referrals
FOR SELECT TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "referrals: admin write" ON public.affiliate_referrals;
CREATE POLICY "referrals: admin write" ON public.affiliate_referrals
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_payout_methods -----------------------------------------------------
DROP POLICY IF EXISTS "payout methods: own read" ON public.user_payout_methods;
CREATE POLICY "payout methods: own read" ON public.user_payout_methods
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "payout methods: own insert" ON public.user_payout_methods;
CREATE POLICY "payout methods: own insert" ON public.user_payout_methods
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "payout methods: own update" ON public.user_payout_methods;
CREATE POLICY "payout methods: own update" ON public.user_payout_methods
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "payout methods: own delete" ON public.user_payout_methods;
CREATE POLICY "payout methods: own delete" ON public.user_payout_methods
FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- affiliate_withdrawals ---------------------------------------------------
DROP POLICY IF EXISTS "withdrawals: own read" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: own read" ON public.affiliate_withdrawals
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals: own request" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: own request" ON public.affiliate_withdrawals
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND amount > 0);

-- Only admins may change status / release money.
DROP POLICY IF EXISTS "withdrawals: admin update" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: admin update" ON public.affiliate_withdrawals
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals: admin delete" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals: admin delete" ON public.affiliate_withdrawals
FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- affiliate_settings ------------------------------------------------------
DROP POLICY IF EXISTS "affiliate settings: read" ON public.affiliate_settings;
CREATE POLICY "affiliate settings: read" ON public.affiliate_settings
FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "affiliate settings: admin write" ON public.affiliate_settings;
CREATE POLICY "affiliate settings: admin write" ON public.affiliate_settings
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- plan_articles -----------------------------------------------------------
DROP POLICY IF EXISTS "plan articles: public read published" ON public.plan_articles;
CREATE POLICY "plan articles: public read published" ON public.plan_articles
FOR SELECT TO anon, authenticated USING (is_published = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "plan articles: admin write" ON public.plan_articles;
CREATE POLICY "plan articles: admin write" ON public.plan_articles
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------- 5. AUTOMATIC REFERRAL CODE + LINKING
-- Username-style affiliate code, e.g. nadeem4821
CREATE OR REPLACE FUNCTION public.generate_referral_code(_email text, _name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; i int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(nullif(_name,''), split_part(coalesce(_email,'ad4you'),'@',1)), '[^a-zA-Z0-9]', '', 'g'));
  IF length(base) < 3 THEN base := 'ad4you'; END IF;
  base := left(base, 12);
  LOOP
    candidate := base || lpad((floor(random()*10000))::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE lower(referral_code) = candidate);
    i := i + 1;
    EXIT WHEN i > 10;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Fires on public.users rows created by your existing handle_new_user trigger.
-- 1) gives every user their own username-style referral code
-- 2) records the invite (auth metadata `referred_by`) as a FREE referral
CREATE OR REPLACE FUNCTION public.affiliate_on_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite text; ref_id uuid;
BEGIN
  IF NEW.referral_code IS NULL
     OR NEW.referral_code = ''
     OR NEW.referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
  THEN
    UPDATE public.users
       SET referral_code = public.generate_referral_code(NEW.email, NEW.full_name)
     WHERE id = NEW.id;
  END IF;

  SELECT coalesce(raw_user_meta_data->>'referred_by', raw_user_meta_data->>'ref')
    INTO invite
    FROM auth.users WHERE id = NEW.id;

  IF invite IS NOT NULL AND length(invite) >= 3 THEN
    SELECT id INTO ref_id FROM public.users WHERE lower(referral_code) = lower(invite) LIMIT 1;
    IF ref_id IS NULL AND invite ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO ref_id FROM public.users WHERE id = invite::uuid;
    END IF;
    IF ref_id IS NOT NULL AND ref_id <> NEW.id THEN
      INSERT INTO public.affiliate_referrals (referrer_id, referred_id, referred_email, status)
      VALUES (ref_id, NEW.id, NEW.email, 'free')
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS affiliate_on_new_user_trg ON public.users;
CREATE TRIGGER affiliate_on_new_user_trg AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_new_user();

-- Backfill codes for existing users
UPDATE public.users
   SET referral_code = public.generate_referral_code(email, full_name)
 WHERE referral_code IS NULL
    OR referral_code = ''
    OR referral_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- ---------------------------------------- 6. COMMISSION ON PREMIUM UPGRADE
-- When a payment is confirmed/completed, the referral flips to PREMIUM and the
-- referrer earns the configured commission percent of the paid amount.
CREATE OR REPLACE FUNCTION public.affiliate_award_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pct numeric; paid numeric;
BEGIN
  IF lower(coalesce(NEW.status,'')) NOT IN ('confirmed','completed','finished','paid') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(value,'')::numeric, 30) INTO pct
    FROM public.affiliate_settings WHERE key = 'affiliate_commission_percent';
  pct := coalesce(pct, 30);
  paid := coalesce(NEW.amount, 0);

  UPDATE public.affiliate_referrals
     SET status = 'premium',
         commission_amount = round(paid * pct / 100.0, 2),
         activated_at = coalesce(activated_at, now())
   WHERE referred_id = NEW.user_id
     AND status <> 'premium';

  RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='payments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS affiliate_award_commission_trg ON public.payments';
    EXECUTE 'CREATE TRIGGER affiliate_award_commission_trg
             AFTER INSERT OR UPDATE OF status ON public.payments
             FOR EACH ROW EXECUTE FUNCTION public.affiliate_award_commission()';
  END IF;
END
$do$;

-- Realtime (safe if already added)
DO $do$
BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_referrals'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_withdrawals'; EXCEPTION WHEN others THEN NULL; END;
END
$do$;

-- ------------------------------------------ 7. SEED PACKAGE INFO ARTICLES
INSERT INTO public.plan_articles (plan_slug, emoji, title, subtitle, content, sort_order) VALUES
('starter', '🚀', 'Starter Plan — Your First $10–$50 Per Day',
 'Perfect for testing the system on one PC before you scale.',
 E'## 🚀 Who the Starter plan is for\n\nYou want proof before you invest. Starter gives you the **full AD4YOU engine on 1 PC** so you can watch real ad impressions land in your dashboard within hours.\n\n---\n\n### 💵 Realistic daily earnings\n\n```\n1 PC running 6 hours/day\n= ~6,000 - 10,000 views/day\n= $12 - $30/day at $2 CPM\n= $360 - $900/month\n```\n\n### ✅ What you get\n\n- 🖥 **1 PC login** — install and start in under 5 minutes\n- 🌍 **US/Canada identity spoofing** — high-CPM traffic quality\n- 📊 **Live view counter** in your dashboard\n- 🔒 **Fingerprint protection** so sessions look like real users\n- 🎧 **Standard support**\n\n### ⚠️ The honest limitation\n\nOne PC = one IP. That caps how much you can safely earn. When you outgrow it, upgrade to **Pro** (proxy rotation) or **Business** (team automation) — where the real money is.\n', 1),
('pro', '💎', 'Pro Plan — Maximum Solo Earnings With Proxies',
 'Rotating US + Canada IPs on every visit for the highest CPM you can get alone.',
 E'## 💎 Pro = highest CPM you can earn by yourself\n\nEvery visit rotates to a **new US/Canada IP**, so ad networks see fresh, premium-geo users instead of one repeated visitor.\n\n---\n\n### 🔁 How rotation makes you more money\n\n```\nEach visit  -> new US/Canada IP\nSoftware    -> auto-changes fingerprint + IP per visit\nResult      -> HIGHEST CPM ($5 - $15 per 1000 views)\n```\n\n### 💰 Earning example\n\n```\n3 PCs x 8 hours/day = 40,000 views/day\nAt $5 CPM  = $200/day  = $6,000/month\nAt $10 CPM = $400/day  = $12,000/month\n```\n\n### ✅ What you get\n\n- 🌐 **Proxy support** (US + Canada rotating IPs)\n- 🖥 **Multiple PC logins**\n- ⚡ **Peak-hour scheduler** — run 8 PM–11 PM EST for up to 3x CPM\n- 🔀 **Multi-URL rotation** — prevents pattern detection\n- 📈 **Advanced analytics** per PC and per URL\n- 🎯 **Priority support**\n\n### 🧠 Pro tip\n\nPair Pro with high-CPM networks — **Adsterra ($3–15)**, **PropellerAds ($5–20)**, **Media.net ($2–10)**, **Ezoic ($5–25)**. The same traffic can earn 5x more just by switching network.\n', 2),
('business', '👑', 'Business Plan — How To Earn $700 to $15,000+ Per Month (Team Automation)',
 'The golden method: other people run the software, you keep 75% of the profit.',
 E'# 🎉 AD4YOU BUSINESS — EARN $500 – $5,000+ DAILY\n\n> Stop trading your own electricity, your own IP and your own risk for pennies. Business turns you from a *worker* into an **owner**.\n\n---\n\n## 😖 The pain you are living right now\n\n- You run a bot from **one IP** → one ban and your income is **$0 overnight**\n- Your PC runs all night and you still make **$5–$10/day**\n- You cannot scale, because you only have **one internet connection**\n- You are the employee of your own bot\n\n**Business fixes all three — permanently.**\n\n---\n\n## 🎯 TWO WAYS TO EARN\n\n### 📌 METHOD 1 — Solo with proxies (maximum personal earnings)\n\n- ✅ Proxy setup required\n- ✅ US + Canada rotating IPs (new IP per visit)\n- ✅ Highest CPM: **$5–$15 per 1000 views**\n\n```\nEach visit rotates to a new US/Canada IP\nSoftware automatically changes IP per visit\nResult: HIGHEST CPM ($5-$15 per 1000 views)\n```\n\n**Best for:** users who can invest in proxies and want max earnings alone.\n\n---\n\n### 📌 METHOD 2 — Full automation, team-based ⭐ RECOMMENDED\n\nSit at home. Watch earnings grow while **others do the work for you**.\n\n#### STEP 1 — Post an ad\n\nFacebook 📘 · WhatsApp groups 💬 · Telegram 📱 · local classified sites 🌐\n\n```\n"HIRING! Work from home!\nJust run our software on your PC.\nEarn $10-$50 daily.\nDM for details!"\n```\n\n#### STEP 2 — Create a WhatsApp group\n\nName it **"AD4YOU Workers"**. Interested people join and ask: *"How much will you pay us?"*\n\n#### STEP 3 — The profit formula\n\n```\nYOU EARN from ad networks:     $2.00 per 1000 views\nYOU PAY your worker:           $0.50 per 1000 views\nYOUR PROFIT per worker:        $1.50 per 1000 views\n                               ======================\n                               75% profit margin!\n```\n\nMessage to workers:\n\n```\n"I''ll pay you $0.50 for every 1,000 views\nyou generate from your PC. Payment via\nJazzCash / Easypaisa / PayPal weekly."\n```\n\n#### STEP 4 — Add workers in 3 clicks (Admin Panel)\n\n1. **Worker name** — e.g. "Ahmed Khan"\n2. **Email + password** — their software login\n3. **Assign URL** — your monetised page\n4. **Save** ✅\n\n#### STEP 5 — Workers start earning for you\n\nThey download the software → log in with the credentials you created → press **START** → your site opens automatically → **every view lands in your admin panel in real time**.\n\n---\n\n## 🔥 WHY THIS IS GENIUS: different IPs = almost no ban risk\n\n```\n❌ OLD METHOD:\n   You run bot from 1 IP = HIGH BAN RISK\n\n✅ NEW METHOD:\n   20 workers = 20 different IPs = ALMOST 0% BAN CHANCE\n```\n\nEach worker has their **own home internet, own IP, own device**. Ad networks see 20 different real users → **ban chance drops ~95%**.\n\n---\n\n## 💵 REAL EARNINGS CALCULATION\n\n### 20 workers\n\n```\nEach worker: 5 hours/day -> 10,000 views/day, you pay $5/day\n\nTotal views:      200,000/day\nYour earnings:    $400/day  (at $2 CPM)\nWorker payments:  $100/day  (20 x $5)\nNET PROFIT:       $300/day = $9,000/month\n```\n\n### 50 workers\n\n```\nTotal views:   500,000/day\nEarnings:      $1,000/day\nPayments:      $250/day\nNET PROFIT:    $750/day = $22,500/month\n```\n\n### 100 workers\n\n```\nTotal views:   1,000,000/day\nEarnings:      $2,000/day\nPayments:      $500/day\nNET PROFIT:    $1,500/day = $45,000/month\n```\n\n---\n\n## 📈 EARNING PROGRESSION\n\n```\nWeek 1:  5 workers   -> $75/day    -> $525/week\nWeek 2:  10 workers  -> $150/day   -> $1,050/week\nWeek 3:  20 workers  -> $300/day   -> $2,100/week\nMonth 2: 50 workers  -> $750/day   -> $22,500/month\nMonth 3: 100 workers -> $1,500/day -> $45,000/month\nMonth 6: 200 workers -> $3,000/day -> $90,000/month\n```\n\n---\n\n## 🎩 TEAM LEADER FEATURE (auto-management)\n\nToo many workers to manage? **Promote your best worker to Team Leader.**\n\nThey can ✅ add workers ✅ remove inactive ones ✅ monitor earnings ✅ handle payments. You just check the numbers.\n\n```\nYou (Owner):   keeps 60% of profit\nTeam Leader:   gets 20% of profit\nWorkers:       get 20% (paid per view)\n```\n\n---\n\n## 🏆 THE COMPLETE SYSTEM YOU GET\n\n| Feature | Description |\n|---|---|\n| 👥 **Worker Management** | Add/remove workers in 3 clicks |\n| 💰 **Earnings Dashboard** | Real-time earnings per worker |\n| 📊 **View Counter** | Track every view per user |\n| 🎯 **Rate Control** | Set custom pay rate per worker |\n| 🏆 **Leaderboard** | See top performers |\n| 👑 **Bonus System** | Motivate workers with bonuses |\n| 📈 **Analytics** | Daily / weekly / monthly reports |\n| 🎩 **Team Leader** | Assign a manager for the team |\n| 🌐 **URL Sharing** | All workers use the same URL |\n| 🔒 **Auto Login** | Workers log in with email/password |\n\n---\n\n## 🚀 30-DAY STARTUP PLAN\n\n**Week 1 — Foundation:** buy Business, put ad codes on your site, post recruitment ads, add first 5 workers.\n\n**Week 2 — Growth:** grow to 15 workers, optimise URLs for CPM, watch daily earnings.\n\n**Week 3 — Scale:** 30 workers, appoint 1 Team Leader, move to premium ad networks.\n\n**Week 4 — Automation:** 50+ workers, Team Leader runs the day-to-day, you collect.\n\n---\n\n## 💡 PRO TIPS FOR MAX EARNINGS\n\n1. **Pick high-CPM networks** — Adsterra ($3–15), PropellerAds ($5–20), Media.net ($2–10), Ezoic ($5–25)\n2. **Target US/Canada traffic** — the software auto-fakes US identity, giving 15–25x higher CPM\n3. **Focus peak hours** — 8 PM–11 PM EST pays up to 3x more\n4. **Rotate URLs weekly** — never put every worker on one link\n5. **Motivate the team** — weekly bonuses and a leaderboard keep views consistent\n\n---\n\n## 🎁 HANDS-FREE INCOME\n\n```\nMorning:\n  check earnings on phone (1 min)\n  send worker payments (5 min)\n  total: 6 minutes/day\n\nEnd of month:\n  $10,000 - $50,000+ profit\n  ~90% automated\n```\n\n---\n\n## 📞 START EARNING TODAY\n\n1. **Buy the Business Plan**\n2. **Get Admin Panel access**\n3. **Post your job ad** (Facebook / WhatsApp)\n4. **Add workers** (3 clicks each)\n5. **Watch earnings grow** 💰\n\n> Every day you wait is a day your competitors are recruiting the workers you could have hired.\n', 3)
ON CONFLICT (plan_slug) DO NOTHING;

-- ============================================================================
-- Reload PostgREST schema cache so the new tables are visible immediately.
NOTIFY pgrst, 'reload schema';

-- DONE. No schema-cache errors on a fresh database.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: RUN_IN_SUPABASE_SQL_EDITOR.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- AD4YOU — Fix payout methods saving
-- Run this ONCE in your live project's SQL editor.
--
-- Why: your database already has a `payment_methods` table that belongs to
-- another feature (columns: name/type/logoUrl/link) — it is NOT a per-user
-- payout table. That is why saving failed with
-- "Could not find the 'method_type' column of 'payment_methods'".
-- The app now uses its own table: user_payout_methods.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,          -- wire_bank | bank | paypal | payoneer | crypto
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods TO authenticated;
GRANT ALL ON public.user_payout_methods TO service_role;

ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout own" ON public.user_payout_methods;
CREATE POLICY "payout own" ON public.user_payout_methods
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx
  ON public.user_payout_methods(user_id);

-- Reload the API schema cache so the app sees the new table immediately.
NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_MEMBER_WEB_LOGIN_FIX.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — WEB TEAM MEMBER LOGIN FIX
--
-- Run this file in the SAME database used by the website's
-- EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY connection.
--
-- This does not alter the desktop Team Member login/session table
-- (public.member_sessions). It only adds the separate server-managed session
-- storage used by the website.
--
-- Current web code contract:
--   team_members read:  id, team_id, email, password_hash, is_active, user_id
--   team_members write: user_id, last_web_login
--   sessions insert:    member_id, team_id, token_hash, user_agent
--   sessions read:      id, member_id, team_id, token_hash, expires_at
--   sessions update:    last_seen
--   sessions delete:    id
-- ============================================================================

BEGIN;

-- Fail clearly if this is run in the wrong database. These are the two
-- existing desktop-software tables that the web login intentionally reuses.
DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.teams. Run this SQL in the database already used by the AD4YOU desktop software.';
  END IF;

  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.team_members. Run this SQL in the database already used by the AD4YOU desktop software.';
  END IF;
END
$$;

-- Compatibility fields required by the current website login implementation.
-- Existing software columns and data are left unchanged.
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS last_web_login TIMESTAMPTZ;

-- Credential login performs a case-insensitive email lookup. Linked-account
-- login looks up the optional website account id.
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower
  ON public.team_members (lower(email));

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members (user_id)
  WHERE user_id IS NOT NULL;

-- This table is separate from public.member_sessions, which remains owned by
-- and compatible with the desktop software.
CREATE TABLE IF NOT EXISTS public.member_web_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL
             REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL
             REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Required for session validation, member cleanup, and expiry maintenance.
CREATE INDEX IF NOT EXISTS idx_member_web_sessions_member
  ON public.member_web_sessions (member_id);

CREATE INDEX IF NOT EXISTS idx_member_web_sessions_team
  ON public.member_web_sessions (team_id);

CREATE INDEX IF NOT EXISTS idx_member_web_sessions_expires
  ON public.member_web_sessions (expires_at);

-- Session rows contain bearer-token hashes and must never be exposed through
-- the browser Data API. The web login accesses them only through trusted
-- server code using the service role.
GRANT ALL ON TABLE public.member_web_sessions TO service_role;
REVOKE ALL ON TABLE public.member_web_sessions FROM anon, authenticated;

ALTER TABLE public.member_web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_web_sessions FORCE ROW LEVEL SECURITY;

-- Remove any accidentally created client policies. No anon/authenticated
-- policy is required: service_role bypasses RLS and is the sole accessor.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_web_sessions'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.member_web_sessions',
      policy_name
    );
  END LOOP;
END
$$;

COMMIT;

-- Make PostgREST discover the new table immediately.
NOTIFY pgrst, 'reload schema';

-- Verification: this must return one row with all columns listed above.
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member_web_sessions'
ORDER BY ordinal_position;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_TEAM_RECRUITMENT.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — TEAM RECRUITMENT & APPLICATION MANAGEMENT SYSTEM
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
--
-- Nothing existing is dropped or altered destructively:
--   teams, team_members, member_sessions, member_web_sessions, earnings_*,
--   member_ledger, member_withdrawals  -> untouched (only additive columns).
-- All new tables are service-role only (the web app reaches them exclusively
-- through server-side functions that already validate team ownership).
-- ============================================================================

-- 0) Guards -------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION 'public.teams is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'public.team_members is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
END $$;

-- 1) Additive compatibility columns ------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS max_members INTEGER;                 -- optional owner override

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS application_id UUID,                 -- where the member came from
  ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- 2) Joining forms ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_join_forms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id          UUID,
  slug              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','paused','closed')),
  headline          TEXT,
  subheadline       TEXT,
  about_team        TEXT,
  closed_message    TEXT,
  success_message   TEXT,
  logo_url          TEXT,
  cover_url         TEXT,
  primary_color     TEXT DEFAULT '#22d3ee',
  accent_color      TEXT DEFAULT '#a855f7',
  contact_email     TEXT,
  contact_phone     TEXT,
  whatsapp          TEXT,
  website           TEXT,
  social_links      JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_duplicates  BOOLEAN NOT NULL DEFAULT FALSE,
  scoring_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  default_role      TEXT NOT NULL DEFAULT 'runner',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_join_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES public.team_join_forms(id) ON DELETE CASCADE,
  field_key     TEXT NOT NULL,
  field_type    TEXT NOT NULL DEFAULT 'short_text'
                CHECK (field_type IN ('short_text','long_text','email','phone','number','country',
                                      'city','dropdown','multiple_choice','checkboxes','yes_no',
                                      'url','date','file')),
  label         TEXT NOT NULL,
  description   TEXT,
  placeholder   TEXT,
  help_text     TEXT,
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_value     NUMERIC,
  max_value     NUMERIC,
  min_length    INTEGER,
  max_length    INTEGER,
  score_rules   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_join_questions_form ON public.team_join_questions(form_id, sort_order);

-- 3) Applications -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  form_id          UUID REFERENCES public.team_join_forms(id) ON DELETE SET NULL,
  applicant_name   TEXT NOT NULL,
  applicant_email  TEXT NOT NULL,
  applicant_phone  TEXT,
  country          TEXT,
  city             TEXT,
  answers          JSONB NOT NULL DEFAULT '{}'::jsonb,
  score            INTEGER NOT NULL DEFAULT 0,
  score_max        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','under_review','accepted','rejected','archived','withdrawn','expired')),
  rejection_reason TEXT,
  member_id        UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  reviewed_by      UUID,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  rejected_at      TIMESTAMPTZ,
  ip_hash          TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_team   ON public.team_applications(team_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_email  ON public.team_applications(team_id, lower(applicant_email));
CREATE INDEX IF NOT EXISTS idx_applications_answers ON public.team_applications USING gin (answers);

CREATE TABLE IF NOT EXISTS public.team_application_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.team_applications(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  detail         TEXT,
  actor          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_application_events ON public.team_application_events(application_id, created_at DESC);

-- 4) Branded email settings, templates and outbox ----------------------------
CREATE TABLE IF NOT EXISTS public.team_email_settings (
  team_id        UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  business_name  TEXT,
  team_name      TEXT,
  logo_url       TEXT,
  primary_color  TEXT DEFAULT '#22d3ee',
  reply_to       TEXT,
  contact_email  TEXT,
  contact_phone  TEXT,
  whatsapp       TEXT,
  website        TEXT,
  footer_text    TEXT,
  signature      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('received','accepted','rejected','welcome')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, kind)
);

CREATE TABLE IF NOT EXISTS public.team_email_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.team_applications(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,
  to_email       TEXT NOT NULL,
  reply_to       TEXT,
  subject        TEXT NOT NULL,
  html           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON public.team_email_outbox(status, created_at);

-- 5) Secure member onboarding tokens (no plain-text passwords ever) -----------
CREATE TABLE IF NOT EXISTS public.member_setup_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_setup_tokens ON public.member_setup_tokens(member_id);

-- 6) updated_at triggers ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_join_forms','team_join_questions','team_applications',
                           'team_email_settings','team_email_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- 7) Security: service-role only (no browser access at all) ------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_join_forms','team_join_questions','team_applications',
                           'team_application_events','team_email_settings','team_email_templates',
                           'team_email_outbox','member_setup_tokens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 8) Live updates for the owner panel ----------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_applications','team_join_forms'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 9) Reload the API schema cache ---------------------------------------------
NOTIFY pgrst, 'reload schema';

-- 10) Verification ------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('team_join_forms','team_join_questions','team_applications',
                     'team_application_events','team_email_settings','team_email_templates',
                     'team_email_outbox','member_setup_tokens')
ORDER BY table_name;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_TEAM_JOIN_FIXES.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — TEAM JOINING FIXES (email uniqueness + secure onboarding + branding)
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
-- Nothing is dropped. Desktop and web Team Member login stay Personal Email +
-- Password with the existing SHA-256 password_hash format.
-- ============================================================================

-- 0) Guards -------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'public.team_members is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
END $$;

-- 1) Onboarding + branding columns -------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

DO $$
BEGIN
  IF to_regclass('public.team_email_settings') IS NOT NULL THEN
    ALTER TABLE public.team_email_settings
      ADD COLUMN IF NOT EXISTS owner_name   TEXT,
      ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#a855f7';
  END IF;
END $$;

-- 2) Case-insensitive global uniqueness for team member emails ---------------
--    (team 1 and team 2 can never share the same member email)
DO $$
DECLARE dupes INT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email)) e FROM public.team_members
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE NOTICE 'Skipped unique index: % duplicated member email(s) already exist. Clean them, then re-run.', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_email_ci
      ON public.team_members (lower(btrim(email)))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_members_email_ci ON public.team_members (lower(btrim(email)));
CREATE INDEX IF NOT EXISTS idx_users_email_ci        ON public.users (lower(btrim(email)));

-- 3) Single source of truth for "is this email already used on AD4YOU?" -------
--    Checks the real auth accounts, the public account profiles and every team
--    member of every team. Service-role only; never exposed to the browser.
CREATE OR REPLACE FUNCTION public.ad4you_email_owner(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e TEXT := lower(btrim(coalesce(p_email, '')));
        r RECORD;
BEGIN
  IF e = '' THEN
    RETURN jsonb_build_object('kind', 'none', 'team_id', NULL);
  END IF;

  SELECT id, team_id INTO r
  FROM public.team_members
  WHERE lower(btrim(email)) = e
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'member', 'team_id', r.team_id);
  END IF;

  PERFORM 1 FROM public.users WHERE lower(btrim(email)) = e LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'account', 'team_id', NULL);
  END IF;

  PERFORM 1 FROM auth.users WHERE lower(btrim(email)) = e LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'account', 'team_id', NULL);
  END IF;

  RETURN jsonb_build_object('kind', 'none', 'team_id', NULL);
END $$;

REVOKE ALL ON FUNCTION public.ad4you_email_owner(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ad4you_email_owner(TEXT) TO service_role;

-- 4) Reload the API schema cache ---------------------------------------------
NOTIFY pgrst, 'reload schema';

-- 5) Verification -------------------------------------------------------------
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='team_members'
  AND column_name IN ('password_hash','must_set_password','application_id','country','city')
ORDER BY column_name;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='team_email_settings'
  AND column_name IN ('owner_name','accent_color')
ORDER BY column_name;

SELECT public.ad4you_email_owner('  Someone@Example.com ') AS should_be_none;
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='team_members' AND indexname LIKE '%email%';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_TEAM_EARNINGS.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- AD4YOU — Team Member Earnings, Ledger, Withdrawals & Payment Methods
-- Run this whole file once in your Supabase SQL editor.
-- Safe to re-run (everything is IF NOT EXISTS / CREATE OR REPLACE).
-- Requires the existing team tables: teams, team_members, earnings_config.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extra columns on team_members (optional real login accounts)
-- ---------------------------------------------------------------------
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS last_web_login TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower ON public.team_members(lower(email));

-- backfill owner_id from the team
UPDATE public.team_members m
SET owner_id = t.owner_id
FROM public.teams t
WHERE m.team_id = t.id AND m.owner_id IS DISTINCT FROM t.owner_id;

-- ---------------------------------------------------------------------
-- 1. Global withdrawal methods (managed by the site admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payout_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  instructions  TEXT,
  fields        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,type,required,placeholder}]
  min_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_payout_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_payout_methods TO authenticated;
GRANT ALL ON public.admin_payout_methods TO service_role;
ALTER TABLE public.admin_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout methods readable" ON public.admin_payout_methods;
CREATE POLICY "payout methods readable" ON public.admin_payout_methods
  FOR SELECT USING (is_active = TRUE OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "payout methods admin write" ON public.admin_payout_methods;
CREATE POLICY "payout methods admin write" ON public.admin_payout_methods
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.admin_payout_methods (name, slug, instructions, fields, sort_order)
VALUES
  ('PayPal', 'paypal', 'Payments are sent to your PayPal email within 1-3 business days.',
   '[{"key":"paypal_email","label":"PayPal email","type":"email","required":true}]'::jsonb, 1),
  ('Payoneer', 'payoneer', 'Payments are sent to your Payoneer account.',
   '[{"key":"payoneer_email","label":"Payoneer email / ID","type":"text","required":true}]'::jsonb, 2),
  ('Bank Transfer', 'bank', 'Bank transfers take 2-5 business days.',
   '[{"key":"account_holder","label":"Account holder name","type":"text","required":true},
     {"key":"bank_name","label":"Bank name","type":"text","required":true},
     {"key":"account_number","label":"Account number / IBAN","type":"text","required":true},
     {"key":"swift","label":"SWIFT / branch code","type":"text","required":false}]'::jsonb, 3),
  ('Crypto (USDT)', 'crypto', 'Send only to a wallet you control. Network must match exactly.',
   '[{"key":"network","label":"Network (TRC20 / BEP20 / ERC20)","type":"text","required":true},
     {"key":"wallet","label":"Wallet address","type":"text","required":true}]'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Earning entries (what generated the money)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_earning_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL,
  member_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('visit','point','ad_view','ad_click','task','bonus','manual','adjustment')),
  quantity    NUMERIC(16,2) NOT NULL DEFAULT 0,
  rate        NUMERIC(16,6) NOT NULL DEFAULT 0,
  amount      NUMERIC(16,4) NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'bot' CHECK (source IN ('bot','manual','system')),
  note        TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mee_member ON public.member_earning_entries(member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mee_team ON public.member_earning_entries(team_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_earning_entries TO authenticated;
GRANT ALL ON public.member_earning_entries TO service_role;
ALTER TABLE public.member_earning_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "earning entries owner" ON public.member_earning_entries;
CREATE POLICY "earning entries owner" ON public.member_earning_entries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "earning entries member" ON public.member_earning_entries;
CREATE POLICY "earning entries member" ON public.member_earning_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Money ledger (single source of truth for balance)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id       UUID NOT NULL,
  member_id      UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('earning','withdrawal_hold','withdrawal_paid','withdrawal_reversal','adjustment')),
  amount         NUMERIC(16,4) NOT NULL,   -- signed: + credit, - debit
  reference_type TEXT,
  reference_id   UUID,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_member ON public.member_ledger(member_id, created_at DESC);

GRANT SELECT, INSERT ON public.member_ledger TO authenticated;
GRANT ALL ON public.member_ledger TO service_role;
ALTER TABLE public.member_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger owner" ON public.member_ledger;
CREATE POLICY "ledger owner" ON public.member_ledger
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ledger member" ON public.member_ledger;
CREATE POLICY "ledger member" ON public.member_ledger
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Member withdrawals
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_withdrawals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id     TEXT NOT NULL UNIQUE,
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL,
  member_id        UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  amount           NUMERIC(16,4) NOT NULL CHECK (amount > 0),
  method_id        UUID REFERENCES public.admin_payout_methods(id) ON DELETE SET NULL,
  method_name      TEXT NOT NULL,
  method_details   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','successful','rejected')),
  rejection_reason TEXT,
  transaction_id   TEXT,
  admin_notes      TEXT,
  decided_by       UUID,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mw_member ON public.member_withdrawals(member_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_mw_team ON public.member_withdrawals(team_id, status);

GRANT SELECT, INSERT, UPDATE ON public.member_withdrawals TO authenticated;
GRANT ALL ON public.member_withdrawals TO service_role;
ALTER TABLE public.member_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals owner" ON public.member_withdrawals;
CREATE POLICY "withdrawals owner" ON public.member_withdrawals
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals member" ON public.member_withdrawals;
CREATE POLICY "withdrawals member" ON public.member_withdrawals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

-- only one open (pending/processing) request per member at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_withdrawal_per_member
  ON public.member_withdrawals(member_id)
  WHERE status IN ('pending','processing');

-- ---------------------------------------------------------------------
-- 5. Team member web sessions (software credentials login)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_web_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX IF NOT EXISTS idx_mws_member ON public.member_web_sessions(member_id);

GRANT ALL ON public.member_web_sessions TO service_role;
ALTER TABLE public.member_web_sessions ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: sessions are only touched by trusted server code

-- ---------------------------------------------------------------------
-- 6. Balance helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_balance(p_member UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric FROM public.member_ledger WHERE member_id = p_member;
$$;

-- ---------------------------------------------------------------------
-- 7. Credit bot activity into the ledger (idempotent delta crediting)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m           RECORD;
  cfg         RECORD;
  j           JSONB;
  bonus       NUMERIC := 1;
  total_added NUMERIC := 0;
  pair        RECORD;
  counter     NUMERIC;
  credited    NUMERIC;
  delta       NUMERIC;
  rate        NUMERIC;
  amt         NUMERIC;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN RETURN 0; END IF;
  bonus := COALESCE(cfg.bonus_multiplier, 1);

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',        COALESCE(cfg.per_visit_rate, 0)),
      ('point',    'self_points_total',   COALESCE(cfg.per_point_rate, 0)),
      ('ad_view',  'ads_viewed_total',    COALESCE(cfg.per_ad_view_rate, 0)),
      ('ad_click', 'ads_clicked_total',   COALESCE(cfg.per_ad_click_rate, 0))
    ) AS v(kind, col, rate)
  LOOP
    counter := COALESCE((j ->> pair.col)::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO credited
      FROM public.member_earning_entries
      WHERE member_id = p_member AND source = 'bot' AND entry_type = pair.kind;
    delta := counter - credited;
    IF delta > 0 THEN
      rate := pair.rate * bonus;
      amt  := ROUND(delta * rate, 4);
      INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
      VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
              p_member, pair.kind, delta, rate, amt, 'bot', 'Auto-credited from software activity');
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
                p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Manual credit / adjustment by the business owner
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_member_manual(
  p_member UUID, p_entry_type TEXT, p_quantity NUMERIC, p_amount NUMERIC, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; v_owner UUID; v_id UUID;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
  VALUES (m.team_id, v_owner, p_member, p_entry_type, COALESCE(p_quantity, 0),
          CASE WHEN COALESCE(p_quantity,0) = 0 THEN 0 ELSE ROUND(p_amount / p_quantity, 6) END,
          ROUND(p_amount, 4), 'manual', p_note)
  RETURNING id INTO v_id;

  INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
  VALUES (m.team_id, v_owner, p_member,
          CASE WHEN p_amount >= 0 THEN 'earning' ELSE 'adjustment' END,
          ROUND(p_amount, 4), 'manual_entry', v_id, p_note);

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 9. Withdrawal request (transaction-safe, no double spending)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_member_withdrawal(
  p_member UUID, p_amount NUMERIC, p_method UUID, p_details JSONB
) RETURNS public.member_withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  meth     RECORD;
  v_owner  UUID;
  v_min    NUMERIC := 0;
  v_bal    NUMERIC;
  v_ref    TEXT;
  v_row    public.member_withdrawals;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(m.is_active, TRUE) = FALSE THEN RAISE EXCEPTION 'Your account is deactivated'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO meth FROM public.admin_payout_methods WHERE id = p_method AND is_active;
  IF meth IS NULL THEN RAISE EXCEPTION 'That payment method is not available'; END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;

  SELECT GREATEST(COALESCE(min_withdrawal, 0), COALESCE(meth.min_amount, 0)) INTO v_min
    FROM public.earnings_config WHERE team_id = m.team_id;
  v_min := GREATEST(COALESCE(v_min, 0), COALESCE(meth.min_amount, 0));
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum withdrawal is %', v_min;
  END IF;

  IF EXISTS (SELECT 1 FROM public.member_withdrawals
              WHERE member_id = p_member AND status IN ('pending','processing')) THEN
    RAISE EXCEPTION 'You already have a withdrawal in progress';
  END IF;

  v_bal := public.member_balance(p_member);
  IF p_amount > v_bal THEN RAISE EXCEPTION 'Amount is more than your available balance'; END IF;

  v_ref := 'WD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  INSERT INTO public.member_withdrawals
    (reference_id, team_id, owner_id, member_id, amount, method_id, method_name, method_details, status)
  VALUES (v_ref, m.team_id, v_owner, p_member, ROUND(p_amount, 4), meth.id, meth.name, COALESCE(p_details, '{}'::jsonb), 'pending')
  RETURNING * INTO v_row;

  INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
  VALUES (m.team_id, v_owner, p_member, 'withdrawal_hold', -ROUND(p_amount, 4), 'member_withdrawal', v_row.id,
          'Reserved for withdrawal ' || v_ref);

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------
-- 10. Withdrawal decision (successful / rejected / processing)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_member_withdrawal(
  p_id UUID, p_decision TEXT, p_reason TEXT, p_transaction_id TEXT, p_actor UUID
) RETURNS public.member_withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.member_withdrawals;
BEGIN
  SELECT * INTO w FROM public.member_withdrawals WHERE id = p_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF w.status IN ('successful','rejected') THEN RAISE EXCEPTION 'This withdrawal is already %', w.status; END IF;

  IF p_decision = 'processing' THEN
    UPDATE public.member_withdrawals
      SET status = 'processing', decided_by = p_actor, admin_notes = COALESCE(p_reason, admin_notes), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    RETURN w;
  END IF;

  IF p_decision = 'successful' THEN
    UPDATE public.member_withdrawals
      SET status = 'successful', transaction_id = p_transaction_id, admin_notes = COALESCE(p_reason, admin_notes),
          decided_by = p_actor, processed_at = now(), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    -- the hold stays deducted; record the settlement for history
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_paid', 0, 'member_withdrawal', w.id,
            'Paid ' || w.reference_id);
    RETURN w;
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.member_withdrawals
      SET status = 'rejected', rejection_reason = p_reason, decided_by = p_actor,
          processed_at = now(), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    -- return the reserved money
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_reversal', w.amount, 'member_withdrawal', w.id,
            'Refunded ' || w.reference_id || COALESCE(' — ' || p_reason, ''));
    RETURN w;
  END IF;

  RAISE EXCEPTION 'Unknown decision %', p_decision;
END;
$$;

-- ---------------------------------------------------------------------
-- 11. Realtime
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_withdrawals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_earning_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_TEAM_EARNING_FEATURES_AND_EMAIL_UNIQUENESS.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- AD4YOU — Team earning feature switches + global e-mail uniqueness
-- Safe, additive, re-runnable. Nothing is dropped or renamed.
-- Requires the existing tables: teams, team_members, earnings_config,
-- earnings_rate_history, member_earning_entries, member_ledger,
-- team_applications.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Per-team enable / disable switches for each existing earning kind
--    (defaults TRUE so every existing team keeps working exactly as now)
-- ---------------------------------------------------------------------
ALTER TABLE public.earnings_config
  ADD COLUMN IF NOT EXISTS visit_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS point_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ad_view_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ad_click_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- audit trail for switch changes (rate history already exists)
ALTER TABLE public.earnings_rate_history
  ADD COLUMN IF NOT EXISTS old_visit_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_point_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_ad_view_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_ad_click_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_visit_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_point_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_ad_view_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_ad_click_enabled BOOLEAN;

-- ---------------------------------------------------------------------
-- 2. Earning sync now enforces the team switches server-side.
--    Disabled kinds are skipped: no new entry, no new ledger row.
--    Already-recorded earnings are never recalculated or removed,
--    so historical money stays exactly as it was earned.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m           RECORD;
  cfg         RECORD;
  j           JSONB;
  bonus       NUMERIC := 1;
  total_added NUMERIC := 0;
  pair        RECORD;
  counter     NUMERIC;
  credited    NUMERIC;
  delta       NUMERIC;
  rate        NUMERIC;
  amt         NUMERIC;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN RETURN 0; END IF;
  bonus := COALESCE(cfg.bonus_multiplier, 1);

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',      COALESCE(cfg.per_visit_rate, 0),    COALESCE(cfg.visit_enabled, TRUE)),
      ('point',    'self_points_total', COALESCE(cfg.per_point_rate, 0),    COALESCE(cfg.point_enabled, TRUE)),
      ('ad_view',  'ads_viewed_total',  COALESCE(cfg.per_ad_view_rate, 0),  COALESCE(cfg.ad_view_enabled, TRUE)),
      ('ad_click', 'ads_clicked_total', COALESCE(cfg.per_ad_click_rate, 0), COALESCE(cfg.ad_click_enabled, TRUE))
    ) AS v(kind, col, rate, enabled)
  LOOP
    CONTINUE WHEN pair.enabled IS NOT TRUE;      -- team switched this kind off

    counter := COALESCE((j ->> pair.col)::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO credited
      FROM public.member_earning_entries
      WHERE member_id = p_member AND source = 'bot' AND entry_type = pair.kind;
    delta := counter - credited;
    IF delta > 0 THEN
      rate := pair.rate * bonus;
      amt  := ROUND(delta * rate, 4);
      INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
      VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
              p_member, pair.kind, delta, rate, amt, 'bot', 'Auto-credited from software activity');
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
                p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END;
$$;

-- manual owner credits are also blocked for a disabled kind
CREATE OR REPLACE FUNCTION public.credit_member_manual(
  p_member UUID, p_entry_type TEXT, p_quantity NUMERIC, p_amount NUMERIC, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; cfg RECORD; v_owner UUID; v_id UUID; v_ok BOOLEAN := TRUE;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NOT NULL THEN
    v_ok := CASE p_entry_type
      WHEN 'visit'    THEN COALESCE(cfg.visit_enabled, TRUE)
      WHEN 'point'    THEN COALESCE(cfg.point_enabled, TRUE)
      WHEN 'ad_view'  THEN COALESCE(cfg.ad_view_enabled, TRUE)
      WHEN 'ad_click' THEN COALESCE(cfg.ad_click_enabled, TRUE)
      ELSE TRUE END;
  END IF;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'This earning feature is disabled for this team';
  END IF;

  INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
  VALUES (m.team_id, v_owner, p_member, p_entry_type, COALESCE(p_quantity, 0),
          CASE WHEN COALESCE(p_quantity,0) = 0 THEN 0 ELSE ROUND(p_amount / p_quantity, 6) END,
          ROUND(p_amount, 4), 'manual', p_note)
  RETURNING id INTO v_id;

  INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
  VALUES (m.team_id, v_owner, p_member,
          CASE WHEN p_amount >= 0 THEN 'earning' ELSE 'adjustment' END,
          ROUND(p_amount, 4), 'manual_entry', v_id, p_note);

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. ONE e-mail = ONE team member across the WHOLE platform.
--    Team 1 owner and team 2 owner can never hold the same address.
--    (Created only when the current data has no duplicates; if it does,
--     the duplicates are listed by the verification query at the end.)
-- ---------------------------------------------------------------------
DO $$
DECLARE dupes INT;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT lower(email) FROM public.team_members
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY lower(email) HAVING COUNT(*) > 1
  ) d;

  IF dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_global_unique
      ON public.team_members (lower(email))
      WHERE email IS NOT NULL AND email <> '';
  ELSE
    RAISE NOTICE 'Skipped global e-mail unique index: % duplicate address(es) found. Clean them, then re-run this script.', dupes;
  END IF;
END $$;

-- one active application per e-mail per team (duplicate protection)
CREATE UNIQUE INDEX IF NOT EXISTS team_applications_active_email_unique
  ON public.team_applications (team_id, lower(applicant_email))
  WHERE status IN ('pending', 'under_review', 'accepted');

-- fast lookups used by the joining form checks
CREATE INDEX IF NOT EXISTS team_members_email_lower_idx
  ON public.team_members (lower(email));
CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON public.users (lower(email));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- a) switches exist on every team config
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'earnings_config'
  AND column_name IN ('visit_enabled','point_enabled','ad_view_enabled','ad_click_enabled')
ORDER BY column_name;

-- b) the new indexes
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('team_members_email_global_unique','team_applications_active_email_unique',
                    'team_members_email_lower_idx','users_email_lower_idx')
ORDER BY indexname;

-- c) any duplicate member e-mails that still need cleaning
SELECT lower(email) AS email, COUNT(*) AS copies
FROM public.team_members
WHERE email IS NOT NULL AND email <> ''
GROUP BY lower(email) HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- d) per-team settings snapshot
SELECT t.name, c.per_visit_rate, c.visit_enabled, c.point_enabled, c.ad_view_enabled, c.ad_click_enabled
FROM public.earnings_config c JOIN public.teams t ON t.id = c.team_id
ORDER BY t.name;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_TEAM_COMPLETE_SETUP.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- AD4YOU — COMPLETE TEAM / MEMBER LOGIN + EARNINGS + WITHDRAWAL SETUP
-- Run this ENTIRE file once in your Supabase SQL editor (project used by
-- the website and the desktop software).
--
-- 100% safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.
-- It never drops a table, never deletes data, and never changes an
-- existing column type — so your software keeps working unchanged.
--
-- It creates / completes everything the website now needs:
--   A. Base team tables (teams, team_members, earnings_config, ...)
--   B. Extra columns the new web logic uses
--   C. member_web_sessions  <-- the table your login error is about
--   D. admin_payout_methods (dynamic withdrawal methods)
--   E. member_earning_entries + member_ledger + member_withdrawals
--   F. Functions: member_balance, sync_member_bot_earnings,
--      credit_member_manual, request_member_withdrawal,
--      decide_member_withdrawal
--   G. RLS, grants, realtime, schema-cache reload
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers used by the policies below
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =====================================================================
-- A. BASE TEAM TABLES  (skipped automatically if your software already
--    created them — only missing tables get created)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.teams (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               UUID,
  name                   TEXT NOT NULL,
  company_name           TEXT,
  team_leader_id         UUID,
  locked_urls            JSONB DEFAULT '[]'::jsonb,
  locked_proxies         TEXT,
  locked_traffic_mode    TEXT,
  locked_devices         JSONB DEFAULT '[]'::jsonb,
  daily_limit_per_member INTEGER,
  allowed_hours          JSONB,
  settings               JSONB DEFAULT '{}'::jsonb,
  total_members          INTEGER DEFAULT 0,
  online_members         INTEGER DEFAULT 0,
  is_active              BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'runner',
  allowed_tools JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_online     BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url    TEXT,
  phone         TEXT,
  whatsapp      TEXT,
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.earnings_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  per_visit_rate    NUMERIC(16,6) NOT NULL DEFAULT 0,
  per_point_rate    NUMERIC(16,6) NOT NULL DEFAULT 0,
  per_ad_view_rate  NUMERIC(16,6) NOT NULL DEFAULT 0,
  per_ad_click_rate NUMERIC(16,6) NOT NULL DEFAULT 0,
  bonus_multiplier  NUMERIC(10,4) NOT NULL DEFAULT 1,
  min_withdrawal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_symbol   TEXT NOT NULL DEFAULT '$',
  currency_code     TEXT NOT NULL DEFAULT 'USD',
  admin_notes       TEXT,
  updated_by_name   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.earnings_rate_history (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  old_per_visit_rate     NUMERIC(16,6),
  old_per_point_rate     NUMERIC(16,6),
  old_per_ad_view_rate   NUMERIC(16,6),
  old_per_ad_click_rate  NUMERIC(16,6),
  old_bonus_multiplier   NUMERIC(10,4),
  new_per_visit_rate     NUMERIC(16,6),
  new_per_point_rate     NUMERIC(16,6),
  new_per_ad_view_rate   NUMERIC(16,6),
  new_per_ad_click_rate  NUMERIC(16,6),
  new_bonus_multiplier   NUMERIC(10,4),
  changed_by_name        TEXT,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_configurations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  urls_list  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_activity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id  UUID,
  action     TEXT NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_earnings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  visits       NUMERIC(16,2) NOT NULL DEFAULT 0,
  earnings     NUMERIC(16,4) NOT NULL DEFAULT 0,
  hours        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ads_viewed   NUMERIC(16,2) NOT NULL DEFAULT 0,
  ads_clicked  NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, date)
);

CREATE TABLE IF NOT EXISTS public.team_pcs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id      UUID,
  pc_name        TEXT,
  device_id      TEXT,
  ip_address     TEXT,
  is_online      BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- software (desktop app) login sessions
CREATE TABLE IF NOT EXISTS public.member_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  device_id   TEXT,
  ip_address  TEXT,
  login_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_time TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- legacy owner-side withdrawal requests (kept for the software)
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  amount         NUMERIC(16,4) NOT NULL,
  method         TEXT,
  method_details JSONB DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending',
  admin_notes    TEXT,
  transaction_id TEXT,
  approved_by    UUID,
  approved_at    TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.companies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL,
  name                  TEXT NOT NULL,
  boss_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  logo_url              TEXT,
  min_withdrawal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- B. EXTRA COLUMNS THE NEW WEB LOGIC USES
--    (added only when missing — nothing existing is modified)
-- =====================================================================
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_leader_id UUID;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS locked_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS locked_proxies TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS locked_traffic_mode TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS locked_devices JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS daily_limit_per_member INTEGER;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS allowed_hours JSONB;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS total_members INTEGER DEFAULT 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS online_members INTEGER DEFAULT 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS allowed_tools JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
-- website-specific
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS user_id UUID;          -- linked AD4YOU account
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS owner_id UUID;         -- business-plan owner
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS last_web_login TIMESTAMPTZ;
-- bot counters read by the earnings sync
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS visits_today NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS visits_total NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS self_points_today NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS self_points_total NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS ads_viewed_today NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS ads_viewed_total NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS ads_clicked_today NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS ads_clicked_total NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS hours_today NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS hours_lifetime NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS calculated_earnings_today NUMERIC(16,4) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS calculated_earnings_total NUMERIC(16,4) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS withdrawal_total NUMERIC(16,4) DEFAULT 0;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS pending_withdrawal NUMERIC(16,4) DEFAULT 0;

ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '$';
ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'USD';
ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.earnings_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_earnings_config_team ON public.earnings_config(team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_configurations_team ON public.team_configurations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower ON public.team_members(lower(email));
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON public.teams(owner_id);

-- keep owner_id on members in sync with their team
UPDATE public.team_members m
SET owner_id = t.owner_id
FROM public.teams t
WHERE m.team_id = t.id AND m.owner_id IS DISTINCT FROM t.owner_id;

CREATE OR REPLACE FUNCTION public.team_member_fill_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.teams WHERE id = NEW.team_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_team_member_fill_owner ON public.team_members;
CREATE TRIGGER trg_team_member_fill_owner
  BEFORE INSERT OR UPDATE OF team_id ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_member_fill_owner();

-- =====================================================================
-- C. TEAM MEMBER WEB SESSIONS  ← fixes the login error you saw
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.member_web_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX IF NOT EXISTS idx_mws_member ON public.member_web_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_mws_expires ON public.member_web_sessions(expires_at);

GRANT ALL ON public.member_web_sessions TO service_role;
ALTER TABLE public.member_web_sessions ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only trusted server code may read/write sessions.

-- =====================================================================
-- D. GLOBAL WITHDRAWAL METHODS (site admin managed, shown dynamically)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_payout_methods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  instructions TEXT,
  fields       JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_payout_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_payout_methods TO authenticated;
GRANT ALL ON public.admin_payout_methods TO service_role;
ALTER TABLE public.admin_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout methods readable" ON public.admin_payout_methods;
CREATE POLICY "payout methods readable" ON public.admin_payout_methods
  FOR SELECT USING (is_active = TRUE OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "payout methods admin write" ON public.admin_payout_methods;
CREATE POLICY "payout methods admin write" ON public.admin_payout_methods
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.admin_payout_methods (name, slug, instructions, fields, sort_order)
VALUES
  ('PayPal', 'paypal', 'Payments are sent to your PayPal email within 1-3 business days.',
   '[{"key":"paypal_email","label":"PayPal email","type":"email","required":true}]'::jsonb, 1),
  ('Payoneer', 'payoneer', 'Payments are sent to your Payoneer account.',
   '[{"key":"payoneer_email","label":"Payoneer email / ID","type":"text","required":true}]'::jsonb, 2),
  ('Bank Transfer', 'bank', 'Bank transfers take 2-5 business days.',
   '[{"key":"account_holder","label":"Account holder name","type":"text","required":true},
     {"key":"bank_name","label":"Bank name","type":"text","required":true},
     {"key":"account_number","label":"Account number / IBAN","type":"text","required":true},
     {"key":"swift","label":"SWIFT / branch code","type":"text","required":false}]'::jsonb, 3),
  ('Crypto (USDT)', 'crypto', 'Send only to a wallet you control. Network must match exactly.',
   '[{"key":"network","label":"Network (TRC20 / BEP20 / ERC20)","type":"text","required":true},
     {"key":"wallet","label":"Wallet address","type":"text","required":true}]'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- E. EARNINGS, LEDGER, WITHDRAWALS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.member_earning_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id    UUID,
  member_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('visit','point','ad_view','ad_click','task','bonus','manual','adjustment')),
  quantity    NUMERIC(16,2) NOT NULL DEFAULT 0,
  rate        NUMERIC(16,6) NOT NULL DEFAULT 0,
  amount      NUMERIC(16,4) NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'bot' CHECK (source IN ('bot','manual','system')),
  note        TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mee_member ON public.member_earning_entries(member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mee_team ON public.member_earning_entries(team_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_earning_entries TO authenticated;
GRANT ALL ON public.member_earning_entries TO service_role;
ALTER TABLE public.member_earning_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "earning entries owner" ON public.member_earning_entries;
CREATE POLICY "earning entries owner" ON public.member_earning_entries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "earning entries member" ON public.member_earning_entries;
CREATE POLICY "earning entries member" ON public.member_earning_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.member_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id       UUID,
  member_id      UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('earning','withdrawal_hold','withdrawal_paid','withdrawal_reversal','adjustment')),
  amount         NUMERIC(16,4) NOT NULL,   -- signed: + credit, - debit
  reference_type TEXT,
  reference_id   UUID,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_member ON public.member_ledger(member_id, created_at DESC);

GRANT SELECT, INSERT ON public.member_ledger TO authenticated;
GRANT ALL ON public.member_ledger TO service_role;
ALTER TABLE public.member_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger owner" ON public.member_ledger;
CREATE POLICY "ledger owner" ON public.member_ledger
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ledger member" ON public.member_ledger;
CREATE POLICY "ledger member" ON public.member_ledger
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.member_withdrawals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id     TEXT NOT NULL UNIQUE,
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id         UUID,
  member_id        UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  amount           NUMERIC(16,4) NOT NULL CHECK (amount > 0),
  method_id        UUID REFERENCES public.admin_payout_methods(id) ON DELETE SET NULL,
  method_name      TEXT NOT NULL,
  method_details   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','successful','rejected')),
  rejection_reason TEXT,
  transaction_id   TEXT,
  admin_notes      TEXT,
  decided_by       UUID,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mw_member ON public.member_withdrawals(member_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_mw_team ON public.member_withdrawals(team_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_withdrawal_per_member
  ON public.member_withdrawals(member_id) WHERE status IN ('pending','processing');

GRANT SELECT, INSERT, UPDATE ON public.member_withdrawals TO authenticated;
GRANT ALL ON public.member_withdrawals TO service_role;
ALTER TABLE public.member_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals owner" ON public.member_withdrawals;
CREATE POLICY "withdrawals owner" ON public.member_withdrawals
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "withdrawals member" ON public.member_withdrawals;
CREATE POLICY "withdrawals member" ON public.member_withdrawals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = member_id AND m.user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_member_withdrawals_touch ON public.member_withdrawals;
CREATE TRIGGER trg_member_withdrawals_touch BEFORE UPDATE ON public.member_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- F. RLS + GRANTS FOR THE BASE TEAM TABLES (owner-scoped isolation)
-- =====================================================================
DO $$
DECLARE t TEXT; is_empty BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ARRAY['teams','team_members','earnings_config','earnings_rate_history',
                           'team_configurations','team_activity_logs','team_earnings','team_pcs',
                           'member_sessions','withdrawal_requests','companies','company_payment_methods']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    -- Turn RLS on only for tables that are still empty (i.e. created by this
    -- script). Tables your desktop software is already using are left exactly
    -- as they are, so nothing in the software can break.
    EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', t) INTO is_empty;
    IF is_empty THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "teams owner" ON public.teams;
CREATE POLICY "teams owner" ON public.teams FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "team members owner" ON public.team_members;
CREATE POLICY "team members owner" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND (t.owner_id = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND (t.owner_id = auth.uid() OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "team members self" ON public.team_members;
CREATE POLICY "team members self" ON public.team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- generic owner-scoped policy for every team-child table
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['earnings_config','earnings_rate_history','team_configurations',
                           'team_activity_logs','team_earnings','team_pcs','member_sessions','withdrawal_requests']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "team child owner" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "team child owner" ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.teams tt WHERE tt.id = team_id AND (tt.owner_id = auth.uid() OR public.is_admin(auth.uid()))))
      WITH CHECK (EXISTS (SELECT 1 FROM public.teams tt WHERE tt.id = team_id AND (tt.owner_id = auth.uid() OR public.is_admin(auth.uid()))))$f$, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "companies owner" ON public.companies;
CREATE POLICY "companies owner" ON public.companies FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "company methods owner" ON public.company_payment_methods;
CREATE POLICY "company methods owner" ON public.company_payment_methods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND (c.owner_id = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND (c.owner_id = auth.uid() OR public.is_admin(auth.uid()))));

-- =====================================================================
-- G. FUNCTIONS USED BY THE WEBSITE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.member_balance(p_member UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric FROM public.member_ledger WHERE member_id = p_member;
$$;

CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD; cfg RECORD; j JSONB; bonus NUMERIC := 1; total_added NUMERIC := 0;
  pair RECORD; counter NUMERIC; credited NUMERIC; delta NUMERIC; rate NUMERIC; amt NUMERIC; v_owner UUID;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN RETURN 0; END IF;
  bonus := COALESCE(cfg.bonus_multiplier, 1);

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',      COALESCE(cfg.per_visit_rate, 0)),
      ('point',    'self_points_total', COALESCE(cfg.per_point_rate, 0)),
      ('ad_view',  'ads_viewed_total',  COALESCE(cfg.per_ad_view_rate, 0)),
      ('ad_click', 'ads_clicked_total', COALESCE(cfg.per_ad_click_rate, 0))
    ) AS v(kind, col, rate)
  LOOP
    counter := COALESCE((j ->> pair.col)::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO credited
      FROM public.member_earning_entries
      WHERE member_id = p_member AND source = 'bot' AND entry_type = pair.kind;
    delta := counter - credited;
    IF delta > 0 THEN
      rate := pair.rate * bonus;
      amt  := ROUND(delta * rate, 4);
      INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
      VALUES (m.team_id, v_owner, p_member, pair.kind, delta, rate, amt, 'bot', 'Auto-credited from software activity');
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, v_owner, p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_member_manual(
  p_member UUID, p_entry_type TEXT, p_quantity NUMERIC, p_amount NUMERIC, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; v_owner UUID; v_id UUID;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
  VALUES (m.team_id, v_owner, p_member, p_entry_type, COALESCE(p_quantity, 0),
          CASE WHEN COALESCE(p_quantity,0) = 0 THEN 0 ELSE ROUND(p_amount / p_quantity, 6) END,
          ROUND(p_amount, 4), 'manual', p_note)
  RETURNING id INTO v_id;

  INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
  VALUES (m.team_id, v_owner, p_member,
          CASE WHEN p_amount >= 0 THEN 'earning' ELSE 'adjustment' END,
          ROUND(p_amount, 4), 'manual_entry', v_id, p_note);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_member_withdrawal(
  p_member UUID, p_amount NUMERIC, p_method UUID, p_details JSONB
) RETURNS public.member_withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD; meth RECORD; v_owner UUID; v_min NUMERIC := 0; v_bal NUMERIC; v_ref TEXT; v_row public.member_withdrawals;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(m.is_active, TRUE) = FALSE THEN RAISE EXCEPTION 'Your account is deactivated'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO meth FROM public.admin_payout_methods WHERE id = p_method AND is_active;
  IF meth IS NULL THEN RAISE EXCEPTION 'That payment method is not available'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;

  SELECT COALESCE(min_withdrawal, 0) INTO v_min FROM public.earnings_config WHERE team_id = m.team_id;
  v_min := GREATEST(COALESCE(v_min, 0), COALESCE(meth.min_amount, 0));
  IF p_amount < v_min THEN RAISE EXCEPTION 'Minimum withdrawal is %', v_min; END IF;

  IF EXISTS (SELECT 1 FROM public.member_withdrawals
              WHERE member_id = p_member AND status IN ('pending','processing')) THEN
    RAISE EXCEPTION 'You already have a withdrawal in progress';
  END IF;

  v_bal := public.member_balance(p_member);
  IF p_amount > v_bal THEN RAISE EXCEPTION 'Amount is more than your available balance'; END IF;

  v_ref := 'WD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  INSERT INTO public.member_withdrawals
    (reference_id, team_id, owner_id, member_id, amount, method_id, method_name, method_details, status)
  VALUES (v_ref, m.team_id, v_owner, p_member, ROUND(p_amount, 4), meth.id, meth.name, COALESCE(p_details, '{}'::jsonb), 'pending')
  RETURNING * INTO v_row;

  INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
  VALUES (m.team_id, v_owner, p_member, 'withdrawal_hold', -ROUND(p_amount, 4), 'member_withdrawal', v_row.id,
          'Reserved for withdrawal ' || v_ref);

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_member_withdrawal(
  p_id UUID, p_decision TEXT, p_reason TEXT, p_transaction_id TEXT, p_actor UUID
) RETURNS public.member_withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.member_withdrawals;
BEGIN
  SELECT * INTO w FROM public.member_withdrawals WHERE id = p_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF w.status IN ('successful','rejected') THEN RAISE EXCEPTION 'This withdrawal is already %', w.status; END IF;

  IF p_decision = 'processing' THEN
    UPDATE public.member_withdrawals
      SET status = 'processing', decided_by = p_actor, admin_notes = COALESCE(p_reason, admin_notes)
      WHERE id = p_id RETURNING * INTO w;
    RETURN w;
  END IF;

  IF p_decision = 'successful' THEN
    UPDATE public.member_withdrawals
      SET status = 'successful', transaction_id = p_transaction_id, admin_notes = COALESCE(p_reason, admin_notes),
          decided_by = p_actor, processed_at = now()
      WHERE id = p_id RETURNING * INTO w;
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_paid', 0, 'member_withdrawal', w.id, 'Paid ' || w.reference_id);
    RETURN w;
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.member_withdrawals
      SET status = 'rejected', rejection_reason = p_reason, decided_by = p_actor, processed_at = now()
      WHERE id = p_id RETURNING * INTO w;
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_reversal', w.amount, 'member_withdrawal', w.id,
            'Refunded ' || w.reference_id || COALESCE(' — ' || p_reason, ''));
    RETURN w;
  END IF;

  RAISE EXCEPTION 'Unknown decision %', p_decision;
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_member_bot_earnings(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_member_manual(UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_member_withdrawal(UUID, NUMERIC, UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_member_withdrawal(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- =====================================================================
-- H. LEADERBOARD VIEW (only created if no table/view with that name yet)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'team_leaderboard'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.team_leaderboard AS
      SELECT m.id AS member_id, m.id, m.team_id, m.name, m.role, m.is_online, m.avatar_url, m.last_seen,
             m.visits_today, m.visits_total, m.self_points_today, m.self_points_total,
             m.ads_viewed_today, m.ads_viewed_total, m.ads_clicked_today, m.ads_clicked_total,
             m.hours_today, m.hours_lifetime,
             COALESCE(public.member_balance(m.id), 0) AS balance,
             ROW_NUMBER() OVER (PARTITION BY m.team_id ORDER BY COALESCE(m.visits_total,0) DESC) AS current_rank
      FROM public.team_members m
    $v$;
    EXECUTE 'GRANT SELECT ON public.team_leaderboard TO authenticated, service_role';
  END IF;
END $$;

-- =====================================================================
-- I. REALTIME + SCHEMA CACHE RELOAD
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_withdrawals','member_ledger','member_earning_entries','earnings_config',
                           'team_members','teams','team_configurations']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. Quick check (should return 1 row each):
--   SELECT count(*) FROM public.member_web_sessions;
--   SELECT count(*) FROM public.admin_payout_methods;
-- Team members must have a password set by the owner (or by the software)
-- before they can sign in at /team-login.
-- =====================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_MEMBER_ACTIVITY_SYNC.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — ONE ACTIVITY SOURCE FOR OWNER PANEL + TEAM MEMBER AREA
-- Safe + rerunnable. No table is dropped, no column is removed or retyped.
-- Source of truth stays the public.team_members counters written by the software.
-- ============================================================================

-- 1. Every team must have an earnings config row (a missing row was silently
--    zeroing every member's earnings even though activity existed).
INSERT INTO public.earnings_config (
  team_id, per_visit_rate, per_point_rate, per_ad_view_rate, per_ad_click_rate,
  bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
  visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled
)
SELECT t.id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE
FROM public.teams t
WHERE NOT EXISTS (SELECT 1 FROM public.earnings_config c WHERE c.team_id = t.id);

-- keep it true for teams created later
CREATE OR REPLACE FUNCTION public.ensure_team_earnings_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.earnings_config (
    team_id, per_visit_rate, per_point_rate, per_ad_view_rate, per_ad_click_rate,
    bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
    visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled
  ) VALUES (NEW.id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_teams_earnings_config ON public.teams;
CREATE TRIGGER trg_teams_earnings_config
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.ensure_team_earnings_config();

-- 2. Bot sync now respects the owner's feature switches. Disabled activity is
--    still recorded as counted at 0, so re-enabling never back-pays the
--    disabled period, and repeated calls can never credit twice.
CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD; cfg RECORD; j JSONB; bonus NUMERIC := 1; total_added NUMERIC := 0;
  pair RECORD; counter NUMERIC; credited NUMERIC; delta NUMERIC; rate NUMERIC; amt NUMERIC;
  v_owner UUID; v_on BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN
    INSERT INTO public.earnings_config (team_id, per_visit_rate, per_point_rate, per_ad_view_rate,
      per_ad_click_rate, bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
      visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled)
    VALUES (m.team_id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE);
    SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  END IF;

  bonus   := COALESCE(cfg.bonus_multiplier, 1);
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',      COALESCE(cfg.per_visit_rate, 0),    COALESCE(cfg.visit_enabled, TRUE)),
      ('point',    'self_points_total', COALESCE(cfg.per_point_rate, 0),    COALESCE(cfg.point_enabled, TRUE)),
      ('ad_view',  'ads_viewed_total',  COALESCE(cfg.per_ad_view_rate, 0),  COALESCE(cfg.ad_view_enabled, TRUE)),
      ('ad_click', 'ads_clicked_total', COALESCE(cfg.per_ad_click_rate, 0), COALESCE(cfg.ad_click_enabled, TRUE))
    ) AS v(kind, col, rate, enabled)
  LOOP
    counter := COALESCE((j ->> pair.col)::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO credited
      FROM public.member_earning_entries
      WHERE member_id = p_member AND source = 'bot' AND entry_type = pair.kind;
    delta := counter - credited;
    IF delta > 0 THEN
      v_on := pair.enabled;
      rate := CASE WHEN v_on THEN pair.rate * bonus ELSE 0 END;
      amt  := ROUND(delta * rate, 4);
      INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
      VALUES (m.team_id, v_owner, p_member, pair.kind, delta, rate, amt, 'bot',
              CASE WHEN v_on THEN 'Auto-credited from software activity'
                   ELSE 'Earning feature switched off by team owner' END);
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, v_owner, p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END; $$;

-- 3. Helpful indexes (no-ops if they already exist)
CREATE INDEX IF NOT EXISTS idx_mee_member_source_type ON public.member_earning_entries (member_id, source, entry_type);
CREATE INDEX IF NOT EXISTS idx_mee_team_occurred      ON public.member_earning_entries (team_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_team      ON public.team_members (team_id);

-- 4. Realtime so the member area updates without a refresh
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_earning_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_withdrawals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.earnings_config; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION — replace the email with the runner you want to trace
-- ============================================================================
-- A + B. member_id and team_id used by software, owner panel and web area
SELECT id AS member_id, team_id, name, role, is_active
FROM public.team_members WHERE lower(email) = lower('member@example.com');

-- C. desktop activity counters (the single source of truth)
SELECT id, visits_today, visits_total, ads_viewed_today, ads_viewed_total,
       ads_clicked_today, ads_clicked_total, hours_today, hours_lifetime, is_online, last_seen
FROM public.team_members WHERE lower(email) = lower('member@example.com');

-- D. owner panel leaderboard rows for that team
SELECT id, name, current_rank, visits_today, ads_viewed_today, ads_clicked_today, hours_today
FROM public.team_leaderboard
WHERE team_id = (SELECT team_id FROM public.team_members WHERE lower(email) = lower('member@example.com'))
ORDER BY current_rank;

-- E. money the member sees (run the sync first, then read the balance)
SELECT public.sync_member_bot_earnings((SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))) AS credited_now;
SELECT public.member_balance((SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))) AS available_balance;
SELECT entry_type, SUM(quantity) AS counted, SUM(amount) AS earned
FROM public.member_earning_entries
WHERE member_id = (SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))
GROUP BY entry_type;

-- F. both sides resolve to the same member + team
SELECT tm.id AS member_id, tm.team_id, t.name AS team_name, s.id AS web_session
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
LEFT JOIN public.member_web_sessions s ON s.member_id = tm.id
WHERE lower(tm.email) = lower('member@example.com');

-- G. the earning configuration that applies to that exact team
SELECT * FROM public.earnings_config
WHERE team_id = (SELECT team_id FROM public.team_members WHERE lower(email) = lower('member@example.com'));

-- teams still missing a config (should return 0 rows)
SELECT t.id, t.name FROM public.teams t
LEFT JOIN public.earnings_config c ON c.team_id = t.id WHERE c.id IS NULL;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: AD4YOU_FINAL_SETUP.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AD4YOU — FINAL DATABASE SETUP  (run ONCE in your project's SQL editor)
-- Safe to re-run: every statement is idempotent. Nothing existing is dropped.
--
-- Creates / fixes:
--   1. users.referral_code   -> real username-style codes (e.g. nadeem4821)
--   2. user_payout_methods   -> payout methods (fixes the schema-cache error)
--   3. affiliate_referrals   -> free / premium referral tracking
--   4. affiliate_withdrawals -> withdrawal requests + admin release flow
--   5. reviews               -> public reviews
--   6. Instant 30% commission on a referred user's FIRST premium activation
--   7. Affiliate settings (min withdrawal, commission %, payout lock)
-- ============================================================================

-- ---------------------------------------------------------------- 1. REF CODE
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_referral_code(_email TEXT, _name TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base TEXT; candidate TEXT; i INT := 0;
BEGIN
  base := lower(coalesce(nullif(regexp_replace(coalesce(_name, ''), '[^A-Za-z0-9]', '', 'g'), ''),
                         split_part(coalesce(_email, 'user'), '@', 1)));
  base := lower(regexp_replace(base, '[^a-z0-9]', '', 'g'));
  IF base IS NULL OR length(base) < 3 THEN base := 'ad4you'; END IF;
  base := substr(base, 1, 12);
  LOOP
    candidate := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = candidate);
    i := i + 1;
    IF i > 40 THEN candidate := base || substr(md5(random()::text), 1, 6); EXIT; END IF;
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = ''
     OR NEW.referral_code ~ '^[0-9a-f]{8}-' THEN
    NEW.referral_code := public.generate_referral_code(NEW.email, NEW.full_name);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_users_referral_code ON public.users;
CREATE TRIGGER trg_users_referral_code BEFORE INSERT OR UPDATE OF referral_code
  ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- Backfill every existing user (also replaces old UUID-style codes)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, email, full_name FROM public.users
           WHERE referral_code IS NULL OR referral_code = '' OR referral_code ~ '^[0-9a-f]{8}-' LOOP
    UPDATE public.users
      SET referral_code = public.generate_referral_code(r.email, r.full_name)
      WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key ON public.users(lower(referral_code));

-- ------------------------------------------------------- 2. USER PAYOUT METHODS
CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_payout_methods ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx ON public.user_payout_methods(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods TO authenticated;
GRANT ALL ON public.user_payout_methods TO service_role;
ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout methods own" ON public.user_payout_methods;
CREATE POLICY "payout methods own" ON public.user_payout_methods FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------- 3. AFFILIATE REFERRALS
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_email TEXT,
  status TEXT NOT NULL DEFAULT 'free',
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_referrals_referred_key ON public.affiliate_referrals(referred_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_referrer_idx ON public.affiliate_referrals(referrer_id);
GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals own" ON public.affiliate_referrals;
CREATE POLICY "referrals own" ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.is_admin(auth.uid()));

-- ------------------------------------------------------ 4. AFFILIATE WITHDRAWALS
CREATE TABLE IF NOT EXISTS public.affiliate_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL,
  method_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_user_idx ON public.affiliate_withdrawals(user_id);
GRANT SELECT, INSERT ON public.affiliate_withdrawals TO authenticated;
GRANT ALL ON public.affiliate_withdrawals TO service_role;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "withdrawals own read" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals own read" ON public.affiliate_withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "withdrawals own insert" ON public.affiliate_withdrawals;
CREATE POLICY "withdrawals own insert" ON public.affiliate_withdrawals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- ------------------------------------------------------------------ 5. REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewer_email TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  message TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews public read" ON public.reviews;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT USING (is_approved = TRUE);
DROP POLICY IF EXISTS "reviews own insert" ON public.reviews;
CREATE POLICY "reviews own insert" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------- 6. INSTANT 30% COMMISSION LOGIC
CREATE OR REPLACE FUNCTION public.affiliate_setting(_key TEXT, _default NUMERIC)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT NULLIF(value, '')::numeric FROM public.settings WHERE key = _key LIMIT 1), _default);
$$;

-- Awards the referrer 30% (admin-configurable) once, on the referred user's
-- FIRST premium activation. Repeat renewals of the same user never pay again.
CREATE OR REPLACE FUNCTION public.award_affiliate_commission(_user_id UUID, _amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref RECORD; pct NUMERIC;
BEGIN
  SELECT * INTO ref FROM public.affiliate_referrals WHERE referred_id = _user_id;
  IF ref IS NULL THEN RETURN; END IF;
  IF ref.status = 'premium' THEN RETURN; END IF;              -- pay only once
  IF ref.referrer_id = _user_id THEN RETURN; END IF;          -- never self-refer
  pct := public.affiliate_setting('affiliate_commission_percent', 30);
  UPDATE public.affiliate_referrals
    SET status = 'premium',
        commission_amount = ROUND(COALESCE(_amount, 0) * pct / 100.0, 2),
        activated_at = now()
    WHERE id = ref.id;
END; $$;

CREATE OR REPLACE FUNCTION public.affiliate_on_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan_price NUMERIC;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT price INTO plan_price FROM public.plans
    WHERE id = NEW.plan_id AND COALESCE(is_free, false) = false AND COALESCE(price, 0) > 0;
  IF plan_price IS NULL THEN RETURN NEW; END IF;
  PERFORM public.award_affiliate_commission(NEW.user_id, plan_price);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_affiliate_on_subscription ON public.subscriptions;
CREATE TRIGGER trg_affiliate_on_subscription AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_subscription();

CREATE OR REPLACE FUNCTION public.affiliate_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'finished', 'completed', 'paid') THEN
    PERFORM public.award_affiliate_commission(NEW.user_id, NEW.amount);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_affiliate_on_payment ON public.payments;
CREATE TRIGGER trg_affiliate_on_payment AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_payment();

-- --------------------------------------------------------- 7. DEFAULT SETTINGS
INSERT INTO public.settings (key, value, type, label, description)
SELECT v.key, v.value, v.type, v.label, v.description
FROM (VALUES
  ('affiliate_min_withdrawal', '100', 'number', 'Affiliate minimum withdrawal ($)',
   'Users can request a payout only after their available balance reaches this amount.'),
  ('affiliate_commission_percent', '30', 'number', 'Affiliate commission (%)',
   'Percentage paid to the referrer on a referred user''s first premium subscription.'),
  ('affiliate_lock_payout_methods', 'true', 'boolean', 'Lock payout methods until minimum reached',
   'When enabled, payout methods stay locked until the user reaches the minimum withdrawal amount.')
) AS v(key, value, type, label, description)
WHERE NOT EXISTS (SELECT 1 FROM public.settings s WHERE s.key = v.key);

-- Make the API pick up the new tables immediately.
NOTIFY pgrst, 'reload schema';

-- Final schema cache reload
NOTIFY pgrst, 'reload schema';
