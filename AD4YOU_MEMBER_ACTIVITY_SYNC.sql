-- ============================================================================
-- AD4YOU — ONE ACTIVITY SOURCE FOR OWNER PANEL + TEAM MEMBER AREA
-- Safe + rerunnable. No table is dropped, no column is removed or retyped.
-- Source of truth stays the public.team_members counters written by the software.
-- ============================================================================

-- 1. Every team must have an earnings config row (a missing row was silently
--    zeroing every member's earnings even though activity existed).
INSERT INTO public.earnings_config (
  team_id, per_visit_rate, per_point_rate, per_ad_view_rate, per_ad_click_rate,
  bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
  visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled
)
SELECT t.id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE
FROM public.teams t
WHERE NOT EXISTS (SELECT 1 FROM public.earnings_config c WHERE c.team_id = t.id);

-- keep it true for teams created later
CREATE OR REPLACE FUNCTION public.ensure_team_earnings_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.earnings_config (
    team_id, per_visit_rate, per_point_rate, per_ad_view_rate, per_ad_click_rate,
    bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
    visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled
  ) VALUES (NEW.id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_teams_earnings_config ON public.teams;
CREATE TRIGGER trg_teams_earnings_config
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.ensure_team_earnings_config();

-- 2. Bot sync now respects the owner's feature switches. Disabled activity is
--    still recorded as counted at 0, so re-enabling never back-pays the
--    disabled period, and repeated calls can never credit twice.
CREATE OR REPLACE FUNCTION public.sync_member_bot_earnings(p_member UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD; cfg RECORD; j JSONB; bonus NUMERIC := 1; total_added NUMERIC := 0;
  pair RECORD; counter NUMERIC; credited NUMERIC; delta NUMERIC; rate NUMERIC; amt NUMERIC;
  v_owner UUID; v_on BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RETURN 0; END IF;
  j := to_jsonb(m);

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NULL THEN
    INSERT INTO public.earnings_config (team_id, per_visit_rate, per_point_rate, per_ad_view_rate,
      per_ad_click_rate, bonus_multiplier, min_withdrawal, currency_symbol, currency_code, is_active,
      visit_enabled, point_enabled, ad_view_enabled, ad_click_enabled)
    VALUES (m.team_id, 0.002, 0.00003, 0.0005, 0.01, 1, 5, '$', 'USD', TRUE, TRUE, TRUE, TRUE, TRUE);
    SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  END IF;

  bonus   := COALESCE(cfg.bonus_multiplier, 1);
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  FOR pair IN
    SELECT * FROM (VALUES
      ('visit',    'visits_total',      COALESCE(cfg.per_visit_rate, 0),    COALESCE(cfg.visit_enabled, TRUE)),
      ('point',    'self_points_total', COALESCE(cfg.per_point_rate, 0),    COALESCE(cfg.point_enabled, TRUE)),
      ('ad_view',  'ads_viewed_total',  COALESCE(cfg.per_ad_view_rate, 0),  COALESCE(cfg.ad_view_enabled, TRUE)),
      ('ad_click', 'ads_clicked_total', COALESCE(cfg.per_ad_click_rate, 0), COALESCE(cfg.ad_click_enabled, TRUE))
    ) AS v(kind, col, rate, enabled)
  LOOP
    counter := COALESCE((j ->> pair.col)::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO credited
      FROM public.member_earning_entries
      WHERE member_id = p_member AND source = 'bot' AND entry_type = pair.kind;
    delta := counter - credited;
    IF delta > 0 THEN
      v_on := pair.enabled;
      rate := CASE WHEN v_on THEN pair.rate * bonus ELSE 0 END;
      amt  := ROUND(delta * rate, 4);
      INSERT INTO public.member_earning_entries (team_id, owner_id, member_id, entry_type, quantity, rate, amount, source, note)
      VALUES (m.team_id, v_owner, p_member, pair.kind, delta, rate, amt, 'bot',
              CASE WHEN v_on THEN 'Auto-credited from software activity'
                   ELSE 'Earning feature switched off by team owner' END);
      IF amt <> 0 THEN
        INSERT INTO public.member_ledger (team_id, owner_id, member_id, kind, amount, reference_type, note)
        VALUES (m.team_id, v_owner, p_member, 'earning', amt, 'bot_sync', pair.kind || ' x ' || delta);
        total_added := total_added + amt;
      END IF;
    END IF;
  END LOOP;

  RETURN total_added;
END; $$;

-- 3. Helpful indexes (no-ops if they already exist)
CREATE INDEX IF NOT EXISTS idx_mee_member_source_type ON public.member_earning_entries (member_id, source, entry_type);
CREATE INDEX IF NOT EXISTS idx_mee_team_occurred      ON public.member_earning_entries (team_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_team      ON public.team_members (team_id);

-- 4. Realtime so the member area updates without a refresh
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_earning_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_withdrawals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.earnings_config; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION — replace the email with the runner you want to trace
-- ============================================================================
-- A + B. member_id and team_id used by software, owner panel and web area
SELECT id AS member_id, team_id, name, role, is_active
FROM public.team_members WHERE lower(email) = lower('member@example.com');

-- C. desktop activity counters (the single source of truth)
SELECT id, visits_today, visits_total, ads_viewed_today, ads_viewed_total,
       ads_clicked_today, ads_clicked_total, hours_today, hours_lifetime, is_online, last_seen
FROM public.team_members WHERE lower(email) = lower('member@example.com');

-- D. owner panel leaderboard rows for that team
SELECT id, name, current_rank, visits_today, ads_viewed_today, ads_clicked_today, hours_today
FROM public.team_leaderboard
WHERE team_id = (SELECT team_id FROM public.team_members WHERE lower(email) = lower('member@example.com'))
ORDER BY current_rank;

-- E. money the member sees (run the sync first, then read the balance)
SELECT public.sync_member_bot_earnings((SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))) AS credited_now;
SELECT public.member_balance((SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))) AS available_balance;
SELECT entry_type, SUM(quantity) AS counted, SUM(amount) AS earned
FROM public.member_earning_entries
WHERE member_id = (SELECT id FROM public.team_members WHERE lower(email) = lower('member@example.com'))
GROUP BY entry_type;

-- F. both sides resolve to the same member + team
SELECT tm.id AS member_id, tm.team_id, t.name AS team_name, s.id AS web_session
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
LEFT JOIN public.member_web_sessions s ON s.member_id = tm.id
WHERE lower(tm.email) = lower('member@example.com');

-- G. the earning configuration that applies to that exact team
SELECT * FROM public.earnings_config
WHERE team_id = (SELECT team_id FROM public.team_members WHERE lower(email) = lower('member@example.com'));

-- teams still missing a config (should return 0 rows)
SELECT t.id, t.name FROM public.teams t
LEFT JOIN public.earnings_config c ON c.team_id = t.id WHERE c.id IS NULL;
