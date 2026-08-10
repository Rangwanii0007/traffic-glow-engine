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
-- DONE. No schema-cache errors on a fresh database.
-- ============================================================================
