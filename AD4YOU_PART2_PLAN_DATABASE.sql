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
