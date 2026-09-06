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
DECLARE t TEXT;
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
