
-- REVIEWS
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT USING (is_approved = true OR auth.uid() = user_id);
CREATE POLICY "reviews insert own" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews update own" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews delete own or admin" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- AFFILIATE REFERRALS
CREATE TABLE public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_email TEXT,
  status TEXT DEFAULT 'free',  -- free | premium
  commission_amount NUMERIC(10,2) DEFAULT 0,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referred_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate own referrer" ON public.affiliate_referrals FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "affiliate insert" ON public.affiliate_referrals FOR INSERT TO authenticated WITH CHECK (referrer_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "affiliate update admin" ON public.affiliate_referrals FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- AFFILIATE WITHDRAWALS
CREATE TABLE public.affiliate_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL,
  method_details JSONB,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT ON public.affiliate_withdrawals TO authenticated;
GRANT ALL ON public.affiliate_withdrawals TO service_role;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdraw own" ON public.affiliate_withdrawals FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "withdraw insert own" ON public.affiliate_withdrawals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "withdraw update admin" ON public.affiliate_withdrawals FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- PAYMENT METHODS (user's saved payout details)
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,  -- wire_bank | paypal | payoneer | crypto
  details JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm own" ON public.payment_methods FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- DISCOUNT OFFERS
CREATE TABLE public.discount_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  reason TEXT,
  coupon_code TEXT UNIQUE,
  original_price NUMERIC(10,2) NOT NULL,
  discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 99),
  initial_seats INT NOT NULL DEFAULT 100,
  seats_remaining INT NOT NULL DEFAULT 100,
  daily_decay_min INT DEFAULT 2,
  daily_decay_max INT DEFAULT 6,
  last_decay_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.discount_offers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.discount_offers TO authenticated;
GRANT ALL ON public.discount_offers TO service_role;
ALTER TABLE public.discount_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers public read active" ON public.discount_offers FOR SELECT USING (is_active = true OR public.is_admin(auth.uid()));
CREATE POLICY "offers admin write" ON public.discount_offers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin update" ON public.discount_offers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin delete" ON public.discount_offers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- REFERRAL CODE on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
UPDATE public.users SET referral_code = substr(md5(id::text || random()::text), 1, 10) WHERE referral_code IS NULL;

-- Trigger to auto-set referral_code on new users
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := substr(md5(NEW.id::text || random()::text), 1, 10);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_users_referral_code ON public.users;
CREATE TRIGGER trg_users_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- update triggers
DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pm_updated_at ON public.payment_methods;
CREATE TRIGGER trg_pm_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_offers_updated_at ON public.discount_offers;
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON public.discount_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to decay discount seats daily
CREATE OR REPLACE FUNCTION public.decay_discount_seats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; days_passed INT; decay INT;
BEGIN
  FOR r IN SELECT * FROM public.discount_offers WHERE is_active = true AND seats_remaining > 0 LOOP
    days_passed := GREATEST(0, EXTRACT(DAY FROM (now() - r.last_decay_at))::INT);
    IF days_passed >= 1 THEN
      decay := (r.daily_decay_min + floor(random() * (r.daily_decay_max - r.daily_decay_min + 1))::INT) * days_passed;
      UPDATE public.discount_offers
      SET seats_remaining = GREATEST(0, seats_remaining - decay),
          last_decay_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;
END; $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_referrals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.discount_offers;
