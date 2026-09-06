-- ============================================================================
-- AD4YOU — WEB TEAM MEMBER LOGIN FIX
--
-- Run this file in the SAME database used by the website's
-- EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY connection.
--
-- This does not alter the desktop Team Member login/session table
-- (public.member_sessions). It only adds the separate server-managed session
-- storage used by the website.
--
-- Current web code contract:
--   team_members read:  id, team_id, email, password_hash, is_active, user_id
--   team_members write: user_id, last_web_login
--   sessions insert:    member_id, team_id, token_hash, user_agent
--   sessions read:      id, member_id, team_id, token_hash, expires_at
--   sessions update:    last_seen
--   sessions delete:    id
-- ============================================================================

BEGIN;

-- Fail clearly if this is run in the wrong database. These are the two
-- existing desktop-software tables that the web login intentionally reuses.
DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.teams. Run this SQL in the database already used by the AD4YOU desktop software.';
  END IF;

  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.team_members. Run this SQL in the database already used by the AD4YOU desktop software.';
  END IF;
END
$$;

-- Compatibility fields required by the current website login implementation.
-- Existing software columns and data are left unchanged.
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS last_web_login TIMESTAMPTZ;

-- Credential login performs a case-insensitive email lookup. Linked-account
-- login looks up the optional website account id.
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower
  ON public.team_members (lower(email));

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members (user_id)
  WHERE user_id IS NOT NULL;

-- This table is separate from public.member_sessions, which remains owned by
-- and compatible with the desktop software.
CREATE TABLE IF NOT EXISTS public.member_web_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL
             REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL
             REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Required for session validation, member cleanup, and expiry maintenance.
CREATE INDEX IF NOT EXISTS idx_member_web_sessions_member
  ON public.member_web_sessions (member_id);

CREATE INDEX IF NOT EXISTS idx_member_web_sessions_team
  ON public.member_web_sessions (team_id);

CREATE INDEX IF NOT EXISTS idx_member_web_sessions_expires
  ON public.member_web_sessions (expires_at);

-- Session rows contain bearer-token hashes and must never be exposed through
-- the browser Data API. The web login accesses them only through trusted
-- server code using the service role.
GRANT ALL ON TABLE public.member_web_sessions TO service_role;
REVOKE ALL ON TABLE public.member_web_sessions FROM anon, authenticated;

ALTER TABLE public.member_web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_web_sessions FORCE ROW LEVEL SECURITY;

-- Remove any accidentally created client policies. No anon/authenticated
-- policy is required: service_role bypasses RLS and is the sole accessor.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_web_sessions'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.member_web_sessions',
      policy_name
    );
  END LOOP;
END
$$;

COMMIT;

-- Make PostgREST discover the new table immediately.
NOTIFY pgrst, 'reload schema';

-- Verification: this must return one row with all columns listed above.
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member_web_sessions'
ORDER BY ordinal_position;
