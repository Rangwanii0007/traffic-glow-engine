-- ============================================================================
-- AD4YOU — TEAM RECRUITMENT & APPLICATION MANAGEMENT SYSTEM
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
--
-- Nothing existing is dropped or altered destructively:
--   teams, team_members, member_sessions, member_web_sessions, earnings_*,
--   member_ledger, member_withdrawals  -> untouched (only additive columns).
-- All new tables are service-role only (the web app reaches them exclusively
-- through server-side functions that already validate team ownership).
-- ============================================================================

-- 0) Guards -------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION 'public.teams is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'public.team_members is missing — run AD4YOU_TEAM_COMPLETE_SETUP.sql first';
  END IF;
END $$;

-- 1) Additive compatibility columns ------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS max_members INTEGER;                 -- optional owner override

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS application_id UUID,                 -- where the member came from
  ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- 2) Joining forms ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_join_forms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id          UUID,
  slug              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','paused','closed')),
  headline          TEXT,
  subheadline       TEXT,
  about_team        TEXT,
  closed_message    TEXT,
  success_message   TEXT,
  logo_url          TEXT,
  cover_url         TEXT,
  primary_color     TEXT DEFAULT '#22d3ee',
  accent_color      TEXT DEFAULT '#a855f7',
  contact_email     TEXT,
  contact_phone     TEXT,
  whatsapp          TEXT,
  website           TEXT,
  social_links      JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_duplicates  BOOLEAN NOT NULL DEFAULT FALSE,
  scoring_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  default_role      TEXT NOT NULL DEFAULT 'runner',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_join_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES public.team_join_forms(id) ON DELETE CASCADE,
  field_key     TEXT NOT NULL,
  field_type    TEXT NOT NULL DEFAULT 'short_text'
                CHECK (field_type IN ('short_text','long_text','email','phone','number','country',
                                      'city','dropdown','multiple_choice','checkboxes','yes_no',
                                      'url','date','file')),
  label         TEXT NOT NULL,
  description   TEXT,
  placeholder   TEXT,
  help_text     TEXT,
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_value     NUMERIC,
  max_value     NUMERIC,
  min_length    INTEGER,
  max_length    INTEGER,
  score_rules   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_join_questions_form ON public.team_join_questions(form_id, sort_order);

-- 3) Applications -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  form_id          UUID REFERENCES public.team_join_forms(id) ON DELETE SET NULL,
  applicant_name   TEXT NOT NULL,
  applicant_email  TEXT NOT NULL,
  applicant_phone  TEXT,
  country          TEXT,
  city             TEXT,
  answers          JSONB NOT NULL DEFAULT '{}'::jsonb,
  score            INTEGER NOT NULL DEFAULT 0,
  score_max        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','under_review','accepted','rejected','archived','withdrawn','expired')),
  rejection_reason TEXT,
  member_id        UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  reviewed_by      UUID,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  rejected_at      TIMESTAMPTZ,
  ip_hash          TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_team   ON public.team_applications(team_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_email  ON public.team_applications(team_id, lower(applicant_email));
CREATE INDEX IF NOT EXISTS idx_applications_answers ON public.team_applications USING gin (answers);

CREATE TABLE IF NOT EXISTS public.team_application_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.team_applications(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  detail         TEXT,
  actor          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_application_events ON public.team_application_events(application_id, created_at DESC);

-- 4) Branded email settings, templates and outbox ----------------------------
CREATE TABLE IF NOT EXISTS public.team_email_settings (
  team_id        UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  business_name  TEXT,
  team_name      TEXT,
  logo_url       TEXT,
  primary_color  TEXT DEFAULT '#22d3ee',
  reply_to       TEXT,
  contact_email  TEXT,
  contact_phone  TEXT,
  whatsapp       TEXT,
  website        TEXT,
  footer_text    TEXT,
  signature      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('received','accepted','rejected','welcome')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, kind)
);

CREATE TABLE IF NOT EXISTS public.team_email_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.team_applications(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,
  to_email       TEXT NOT NULL,
  reply_to       TEXT,
  subject        TEXT NOT NULL,
  html           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON public.team_email_outbox(status, created_at);

-- 5) Secure member onboarding tokens (no plain-text passwords ever) -----------
CREATE TABLE IF NOT EXISTS public.member_setup_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_setup_tokens ON public.member_setup_tokens(member_id);

-- 6) updated_at triggers ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_join_forms','team_join_questions','team_applications',
                           'team_email_settings','team_email_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- 7) Security: service-role only (no browser access at all) ------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_join_forms','team_join_questions','team_applications',
                           'team_application_events','team_email_settings','team_email_templates',
                           'team_email_outbox','member_setup_tokens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 8) Live updates for the owner panel ----------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_applications','team_join_forms'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 9) Reload the API schema cache ---------------------------------------------
NOTIFY pgrst, 'reload schema';

-- 10) Verification ------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('team_join_forms','team_join_questions','team_applications',
                     'team_application_events','team_email_settings','team_email_templates',
                     'team_email_outbox','member_setup_tokens')
ORDER BY table_name;
