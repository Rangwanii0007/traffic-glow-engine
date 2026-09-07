-- =====================================================================
-- AD4YOU — Team earning feature switches + global e-mail uniqueness
-- Safe, additive, re-runnable. Nothing is dropped or renamed.
-- Requires the existing tables: teams, team_members, earnings_config,
-- earnings_rate_history, member_earning_entries, member_ledger,
-- team_applications.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Per-team enable / disable switches for each existing earning kind
--    (defaults TRUE so every existing team keeps working exactly as now)
-- ---------------------------------------------------------------------
ALTER TABLE public.earnings_config
  ADD COLUMN IF NOT EXISTS visit_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS point_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ad_view_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ad_click_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- audit trail for switch changes (rate history already exists)
ALTER TABLE public.earnings_rate_history
  ADD COLUMN IF NOT EXISTS old_visit_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_point_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_ad_view_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS old_ad_click_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_visit_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_point_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_ad_view_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS new_ad_click_enabled BOOLEAN;

-- ---------------------------------------------------------------------
-- 2. Earning sync now enforces the team switches server-side.
--    Disabled kinds are skipped: no new entry, no new ledger row.
--    Already-recorded earnings are never recalculated or removed,
--    so historical money stays exactly as it was earned.
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
      ('visit',    'visits_total',      COALESCE(cfg.per_visit_rate, 0),    COALESCE(cfg.visit_enabled, TRUE)),
      ('point',    'self_points_total', COALESCE(cfg.per_point_rate, 0),    COALESCE(cfg.point_enabled, TRUE)),
      ('ad_view',  'ads_viewed_total',  COALESCE(cfg.per_ad_view_rate, 0),  COALESCE(cfg.ad_view_enabled, TRUE)),
      ('ad_click', 'ads_clicked_total', COALESCE(cfg.per_ad_click_rate, 0), COALESCE(cfg.ad_click_enabled, TRUE))
    ) AS v(kind, col, rate, enabled)
  LOOP
    CONTINUE WHEN pair.enabled IS NOT TRUE;      -- team switched this kind off

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

-- manual owner credits are also blocked for a disabled kind
CREATE OR REPLACE FUNCTION public.credit_member_manual(
  p_member UUID, p_entry_type TEXT, p_quantity NUMERIC, p_amount NUMERIC, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; cfg RECORD; v_owner UUID; v_id UUID; v_ok BOOLEAN := TRUE;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE id = p_member FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  v_owner := COALESCE(m.owner_id, (SELECT owner_id FROM public.teams WHERE id = m.team_id));

  SELECT * INTO cfg FROM public.earnings_config WHERE team_id = m.team_id;
  IF cfg IS NOT NULL THEN
    v_ok := CASE p_entry_type
      WHEN 'visit'    THEN COALESCE(cfg.visit_enabled, TRUE)
      WHEN 'point'    THEN COALESCE(cfg.point_enabled, TRUE)
      WHEN 'ad_view'  THEN COALESCE(cfg.ad_view_enabled, TRUE)
      WHEN 'ad_click' THEN COALESCE(cfg.ad_click_enabled, TRUE)
      ELSE TRUE END;
  END IF;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'This earning feature is disabled for this team';
  END IF;

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
-- 3. ONE e-mail = ONE team member across the WHOLE platform.
--    Team 1 owner and team 2 owner can never hold the same address.
--    (Created only when the current data has no duplicates; if it does,
--     the duplicates are listed by the verification query at the end.)
-- ---------------------------------------------------------------------
DO $$
DECLARE dupes INT;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT lower(email) FROM public.team_members
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY lower(email) HAVING COUNT(*) > 1
  ) d;

  IF dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_global_unique
      ON public.team_members (lower(email))
      WHERE email IS NOT NULL AND email <> '';
  ELSE
    RAISE NOTICE 'Skipped global e-mail unique index: % duplicate address(es) found. Clean them, then re-run this script.', dupes;
  END IF;
END $$;

-- one active application per e-mail per team (duplicate protection)
CREATE UNIQUE INDEX IF NOT EXISTS team_applications_active_email_unique
  ON public.team_applications (team_id, lower(applicant_email))
  WHERE status IN ('pending', 'under_review', 'accepted');

-- fast lookups used by the joining form checks
CREATE INDEX IF NOT EXISTS team_members_email_lower_idx
  ON public.team_members (lower(email));
CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON public.users (lower(email));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- a) switches exist on every team config
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'earnings_config'
  AND column_name IN ('visit_enabled','point_enabled','ad_view_enabled','ad_click_enabled')
ORDER BY column_name;

-- b) the new indexes
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('team_members_email_global_unique','team_applications_active_email_unique',
                    'team_members_email_lower_idx','users_email_lower_idx')
ORDER BY indexname;

-- c) any duplicate member e-mails that still need cleaning
SELECT lower(email) AS email, COUNT(*) AS copies
FROM public.team_members
WHERE email IS NOT NULL AND email <> ''
GROUP BY lower(email) HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- d) per-team settings snapshot
SELECT t.name, c.per_visit_rate, c.visit_enabled, c.point_enabled, c.ad_view_enabled, c.ad_click_enabled
FROM public.earnings_config c JOIN public.teams t ON t.id = c.team_id
ORDER BY t.name;
