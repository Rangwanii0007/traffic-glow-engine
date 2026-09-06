-- =====================================================================
-- AD4YOU — Team Member Earnings, Ledger, Withdrawals & Payment Methods
-- Run this whole file once in your Supabase SQL editor.
-- Safe to re-run (everything is IF NOT EXISTS / CREATE OR REPLACE).
-- Requires the existing team tables: teams, team_members, earnings_config.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extra columns on team_members (optional real login accounts)
-- ---------------------------------------------------------------------
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS last_web_login TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower ON public.team_members(lower(email));

-- backfill owner_id from the team
UPDATE public.team_members m
SET owner_id = t.owner_id
FROM public.teams t
WHERE m.team_id = t.id AND m.owner_id IS DISTINCT FROM t.owner_id;

-- ---------------------------------------------------------------------
-- 1. Global withdrawal methods (managed by the site admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payout_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  instructions  TEXT,
  fields        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,type,required,placeholder}]
  min_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- ---------------------------------------------------------------------
-- 2. Earning entries (what generated the money)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_earning_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL,
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

-- ---------------------------------------------------------------------
-- 3. Money ledger (single source of truth for balance)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id       UUID NOT NULL,
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

-- ---------------------------------------------------------------------
-- 4. Member withdrawals
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_withdrawals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id     TEXT NOT NULL UNIQUE,
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL,
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

-- only one open (pending/processing) request per member at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_withdrawal_per_member
  ON public.member_withdrawals(member_id)
  WHERE status IN ('pending','processing');

-- ---------------------------------------------------------------------
-- 5. Team member web sessions (software credentials login)
-- ---------------------------------------------------------------------
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

GRANT ALL ON public.member_web_sessions TO service_role;
ALTER TABLE public.member_web_sessions ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: sessions are only touched by trusted server code

-- ---------------------------------------------------------------------
-- 6. Balance helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_balance(p_member UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric FROM public.member_ledger WHERE member_id = p_member;
$$;

-- ---------------------------------------------------------------------
-- 7. Credit bot activity into the ledger (idempotent delta crediting)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m           RECORD;
  cfg         RECORD;
  j           JSONB;
  bonus       NUMERIC := 1;
  total_added NUMERIC := 0;
  pair        RECORD;
  counter     NUMERIC;
  credited    NUMERIC;
  delta       NUMERIC;
  rate        NUMERIC;
  amt         NUMERIC;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN RETURN 0; END IF;
  bonus := COALESCE(cfg.bonus_multiplier, 1);

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',        COALESCE(cfg.per_visit_rate, 0)),
      ('point',    'self_points_total',   COALESCE(cfg.per_point_rate, 0)),
      ('ad_view',  'ads_viewed_total',    COALESCE(cfg.per_ad_view_rate, 0)),
      ('ad_click', 'ads_clicked_total',   COALESCE(cfg.per_ad_click_rate, 0))
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
      VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
              p_member, pair.kind, delta, rate, amt, 'bot', 'Auto-credited from software activity');
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id)),
                p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Manual credit / adjustment by the business owner
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 9. Withdrawal request (transaction-safe, no double spending)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_member_withdrawal(
  p_member UUID, p_amount NUMERIC, p_method UUID, p_details JSONB
) RETURNS public.member_withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  meth     RECORD;
  v_owner  UUID;
  v_min    NUMERIC := 0;
  v_bal    NUMERIC;
  v_ref    TEXT;
  v_row    public.member_withdrawals;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(m.is_active, TRUE) = FALSE THEN RAISE EXCEPTION 'Your account is deactivated'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO meth FROM public.admin_payout_methods WHERE id = p_method AND is_active;
  IF meth IS NULL THEN RAISE EXCEPTION 'That payment method is not available'; END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;

  SELECT GREATEST(COALESCE(min_withdrawal, 0), COALESCE(meth.min_amount, 0)) INTO v_min
    FROM public.earnings_config WHERE team_id = m.team_id;
  v_min := GREATEST(COALESCE(v_min, 0), COALESCE(meth.min_amount, 0));
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum withdrawal is %', v_min;
  END IF;

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

-- ---------------------------------------------------------------------
-- 10. Withdrawal decision (successful / rejected / processing)
-- ---------------------------------------------------------------------
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
      SET status = 'processing', decided_by = p_actor, admin_notes = COALESCE(p_reason, admin_notes), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    RETURN w;
  END IF;

  IF p_decision = 'successful' THEN
    UPDATE public.member_withdrawals
      SET status = 'successful', transaction_id = p_transaction_id, admin_notes = COALESCE(p_reason, admin_notes),
          decided_by = p_actor, processed_at = now(), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    -- the hold stays deducted; record the settlement for history
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_paid', 0, 'member_withdrawal', w.id,
            'Paid ' || w.reference_id);
    RETURN w;
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.member_withdrawals
      SET status = 'rejected', rejection_reason = p_reason, decided_by = p_actor,
          processed_at = now(), updated_at = now()
      WHERE id = p_id RETURNING * INTO w;
    -- return the reserved money
    INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, reference_id, note)
    VALUES (w.team_id, w.owner_id, w.member_id, 'withdrawal_reversal', w.amount, 'member_withdrawal', w.id,
            'Refunded ' || w.reference_id || COALESCE(' — ' || p_reason, ''));
    RETURN w;
  END IF;

  RAISE EXCEPTION 'Unknown decision %', p_decision;
END;
$$;

-- ---------------------------------------------------------------------
-- 11. Realtime
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_withdrawals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_earning_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
