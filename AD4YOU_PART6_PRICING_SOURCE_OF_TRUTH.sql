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
