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
