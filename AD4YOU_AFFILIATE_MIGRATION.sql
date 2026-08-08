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
