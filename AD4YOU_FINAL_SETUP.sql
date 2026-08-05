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
INSERT INTO public.settings (key, value, type, label, description) VALUES
  ('affiliate_min_withdrawal', '100', 'number', 'Affiliate minimum withdrawal ($)',
   'Users can request a payout only after their available balance reaches this amount.'),
  ('affiliate_commission_percent', '30', 'number', 'Affiliate commission (%)',
   'Percentage paid to the referrer on a referred user''s first premium subscription.'),
  ('affiliate_lock_payout_methods', 'true', 'boolean', 'Lock payout methods until minimum reached',
   'When enabled, payout methods stay locked until the user reaches the minimum withdrawal amount.')
ON CONFLICT (key) DO NOTHING;

-- Make the API pick up the new tables immediately.
NOTIFY pgrst, 'reload schema';
