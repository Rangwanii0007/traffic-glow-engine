-- AD4YOU — MANUAL PAYMENT SYSTEM (additive, safe to re-run).
-- Does NOT touch payments / NOWPayments, plans, or the subscription expiry logic.
-- Adds: countries, manual methods, method↔country links, manual payment submissions,
-- an idempotent approval function, private proof storage and public logo storage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Countries ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  flag TEXT,
  logo_url TEXT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_countries_code_key ON public.payment_countries (upper(code));

-- 2) Manual payment methods --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manual_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'local',
  logo_url TEXT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  account_name TEXT,
  bank_name TEXT,
  account_number TEXT,
  iban TEXT,
  branch TEXT,
  paypal_email TEXT,
  payoneer_account TEXT,
  binance_uid TEXT,
  crypto_coin TEXT,
  crypto_network TEXT,
  wallet_address TEXT,
  reference_info TEXT,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_payment_methods_active_idx ON public.manual_payment_methods (is_active, is_archived, sort_order);

CREATE TABLE IF NOT EXISTS public.manual_payment_method_countries (
  method_id UUID NOT NULL REFERENCES public.manual_payment_methods(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES public.payment_countries(id) ON DELETE CASCADE,
  PRIMARY KEY (method_id, country_id)
);
CREATE INDEX IF NOT EXISTS mpmc_country_idx ON public.manual_payment_method_countries (country_id);

-- 3) Manual payment submissions (price/rate snapshot frozen at submission) ----
CREATE TABLE IF NOT EXISTS public.manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  pricing_option_id UUID,
  plan_name TEXT NOT NULL,
  package_label TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  base_price_usd NUMERIC(12,2) NOT NULL,
  method_id UUID REFERENCES public.manual_payment_methods(id) ON DELETE SET NULL,
  method_name TEXT NOT NULL,
  country_id UUID REFERENCES public.payment_countries(id) ON DELETE SET NULL,
  country_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  local_amount NUMERIC(16,2) NOT NULL,
  rate_source TEXT,
  rate_fetched_at TIMESTAMPTZ,
  transaction_id TEXT NOT NULL,
  screenshot_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  subscription_activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- An older manual_payments table may already exist: add any missing columns (nullable, safe).
ALTER TABLE public.manual_payments
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS pricing_option_id UUID,
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS package_label TEXT,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS base_price_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS method_id UUID,
  ADD COLUMN IF NOT EXISTS method_name TEXT,
  ADD COLUMN IF NOT EXISTS country_id UUID,
  ADD COLUMN IF NOT EXISTS country_name TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS local_amount NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS rate_source TEXT,
  ADD COLUMN IF NOT EXISTS rate_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS manual_payments_txn_key ON public.manual_payments (lower(btrim(transaction_id)));
CREATE UNIQUE INDEX IF NOT EXISTS manual_payments_one_pending_key
  ON public.manual_payments (user_id, plan_id, COALESCE(pricing_option_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS manual_payments_user_idx ON public.manual_payments (user_id);
CREATE INDEX IF NOT EXISTS manual_payments_status_idx ON public.manual_payments (status);
CREATE INDEX IF NOT EXISTS manual_payments_plan_idx ON public.manual_payments (plan_id);
CREATE INDEX IF NOT EXISTS manual_payments_method_idx ON public.manual_payments (method_id);
CREATE INDEX IF NOT EXISTS manual_payments_created_idx ON public.manual_payments (created_at DESC);

-- updated_at triggers (function already exists in this project)
DROP TRIGGER IF EXISTS trg_payment_countries_updated ON public.payment_countries;
CREATE TRIGGER trg_payment_countries_updated BEFORE UPDATE ON public.payment_countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_manual_methods_updated ON public.manual_payment_methods;
CREATE TRIGGER trg_manual_methods_updated BEFORE UPDATE ON public.manual_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_manual_payments_updated ON public.manual_payments;
CREATE TRIGGER trg_manual_payments_updated BEFORE UPDATE ON public.manual_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Grants + RLS --------------------------------------------------------------
GRANT SELECT ON public.payment_countries, public.manual_payment_methods, public.manual_payment_method_countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_countries, public.manual_payment_methods, public.manual_payment_method_countries TO authenticated;
GRANT SELECT ON public.manual_payments TO authenticated;
GRANT ALL ON public.payment_countries, public.manual_payment_methods, public.manual_payment_method_countries, public.manual_payments TO service_role;

ALTER TABLE public.payment_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_method_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "countries read active" ON public.payment_countries;
CREATE POLICY "countries read active" ON public.payment_countries FOR SELECT TO anon, authenticated
  USING (is_active OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "countries admin write" ON public.payment_countries;
CREATE POLICY "countries admin write" ON public.payment_countries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "methods read active" ON public.manual_payment_methods;
CREATE POLICY "methods read active" ON public.manual_payment_methods FOR SELECT TO anon, authenticated
  USING ((is_active AND NOT is_archived) OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "methods admin write" ON public.manual_payment_methods;
CREATE POLICY "methods admin write" ON public.manual_payment_methods FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "method countries read" ON public.manual_payment_method_countries;
CREATE POLICY "method countries read" ON public.manual_payment_method_countries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "method countries admin write" ON public.manual_payment_method_countries;
CREATE POLICY "method countries admin write" ON public.manual_payment_method_countries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Submissions are created/updated only by the server (service role). Owners and admins can read.
DROP POLICY IF EXISTS "manual payments owner or admin read" ON public.manual_payments;
CREATE POLICY "manual payments owner or admin read" ON public.manual_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5) Idempotent approval: activates/extends exactly the purchased package once ---
CREATE OR REPLACE FUNCTION public.approve_manual_payment(p_id UUID, p_admin UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mp public.manual_payments%ROWTYPE;
  cur public.subscriptions%ROWTYPE;
  v_start TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin(p_admin) THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO mp FROM public.manual_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF mp.status = 'approved' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF mp.status <> 'pending' THEN RAISE EXCEPTION 'Only pending payments can be approved'; END IF;

  SELECT * INTO cur FROM public.subscriptions WHERE user_id = mp.user_id FOR UPDATE;
  IF FOUND AND cur.plan_id = mp.plan_id AND cur.status = 'active' AND cur.end_date > now() THEN
    v_start := COALESCE(cur.start_date, now());
    v_end := cur.end_date + make_interval(days => mp.duration_days);
  ELSE
    v_end := now() + make_interval(days => mp.duration_days);
  END IF;

  INSERT INTO public.subscriptions (user_id, plan_id, status, start_date, end_date, duration_days, created_by)
  VALUES (mp.user_id, mp.plan_id, 'active', v_start, v_end, mp.duration_days, 'manual_payment')
  ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active',
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    duration_days = EXCLUDED.duration_days, created_by = 'manual_payment';

  -- Keep the flexible-duration columns in sync when they exist.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='duration_unit') THEN
    EXECUTE 'UPDATE public.subscriptions SET duration_value = $1, duration_unit = ''days'' WHERE user_id = $2'
      USING mp.duration_days, mp.user_id;
  END IF;

  UPDATE public.manual_payments SET status = 'approved', approved_at = now(), reviewed_by = p_admin,
    subscription_activated_at = now(), rejection_reason = NULL WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'end_date', v_end);
END; $$;
REVOKE ALL ON FUNCTION public.approve_manual_payment(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_manual_payment(UUID, UUID) TO service_role;

-- 6) Storage: private proofs (server-signed URLs only) + public method logos ----
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false)
  ON CONFLICT (id) DO UPDATE SET public = false;
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-logos', 'payment-logos', true)
  ON CONFLICT (id) DO NOTHING;

-- 7) Starting countries (real ISO/currency data; admin can edit/add/disable) ----
INSERT INTO public.payment_countries (name, code, flag, currency_code, currency_symbol, sort_order)
SELECT v.* FROM (VALUES
  ('Pakistan','PK','🇵🇰','PKR','Rs',1),
  ('United Kingdom','GB','🇬🇧','GBP','£',2),
  ('United States','US','🇺🇸','USD','$',3),
  ('United Arab Emirates','AE','🇦🇪','AED','AED',4),
  ('Australia','AU','🇦🇺','AUD','A$',5),
  ('India','IN','🇮🇳','INR','₹',6),
  ('Bangladesh','BD','🇧🇩','BDT','৳',7),
  ('Other countries','INTL','🌐','USD','$',99)
) AS v(name, code, flag, currency_code, currency_symbol, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_countries c WHERE upper(c.code) = upper(v.code));

-- 8) Realtime ------------------------------------------------------------------
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_payment_methods; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
