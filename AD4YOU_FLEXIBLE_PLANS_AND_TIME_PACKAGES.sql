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
