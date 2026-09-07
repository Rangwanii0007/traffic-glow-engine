-- ============================================================================
-- AD4YOU — TEAM JOINING FIXES (email uniqueness + secure onboarding + branding)
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
-- Nothing is dropped. Desktop and web Team Member login stay Personal Email +
-- Password with the existing SHA-256 password_hash format.
-- ============================================================================

-- 0) Guards -------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'public.team_members is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
END $$;

-- 1) Onboarding + branding columns -------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

DO $$
BEGIN
  IF to_regclass('public.team_email_settings') IS NOT NULL THEN
    ALTER TABLE public.team_email_settings
      ADD COLUMN IF NOT EXISTS owner_name   TEXT,
      ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#a855f7';
  END IF;
END $$;

-- 2) Case-insensitive global uniqueness for team member emails ---------------
--    (team 1 and team 2 can never share the same member email)
DO $$
DECLARE dupes INT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email)) e FROM public.team_members
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE NOTICE 'Skipped unique index: % duplicated member email(s) already exist. Clean them, then re-run.', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_email_ci
      ON public.team_members (lower(btrim(email)))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_members_email_ci ON public.team_members (lower(btrim(email)));
CREATE INDEX IF NOT EXISTS idx_users_email_ci        ON public.users (lower(btrim(email)));

-- 3) Single source of truth for "is this email already used on AD4YOU?" -------
--    Checks the real auth accounts, the public account profiles and every team
--    member of every team. Service-role only; never exposed to the browser.
CREATE OR REPLACE FUNCTION public.ad4you_email_owner(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e TEXT := lower(btrim(coalesce(p_email, '')));
        r RECORD;
BEGIN
  IF e = '' THEN
    RETURN jsonb_build_object('kind', 'none', 'team_id', NULL);
  END IF;

  SELECT id, team_id INTO r
  FROM public.team_members
  WHERE lower(btrim(email)) = e
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'member', 'team_id', r.team_id);
  END IF;

  PERFORM 1 FROM public.users WHERE lower(btrim(email)) = e LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'account', 'team_id', NULL);
  END IF;

  PERFORM 1 FROM auth.users WHERE lower(btrim(email)) = e LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('kind', 'account', 'team_id', NULL);
  END IF;

  RETURN jsonb_build_object('kind', 'none', 'team_id', NULL);
END $$;

REVOKE ALL ON FUNCTION public.ad4you_email_owner(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ad4you_email_owner(TEXT) TO service_role;

-- 4) Reload the API schema cache ---------------------------------------------
NOTIFY pgrst, 'reload schema';

-- 5) Verification -------------------------------------------------------------
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='team_members'
  AND column_name IN ('password_hash','must_set_password','application_id','country','city')
ORDER BY column_name;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='team_email_settings'
  AND column_name IN ('owner_name','accent_color')
ORDER BY column_name;

SELECT public.ad4you_email_owner('  Someone@Example.com ') AS should_be_none;
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='team_members' AND indexname LIKE '%email%';
