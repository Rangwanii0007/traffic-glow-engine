-- ============================================================================
-- AD4YOU — 1) Discount offers: live activation + public visibility
--          2) Team instant join link (WhatsApp-style share & join)
-- Safe, additive, idempotent. Run once in the Supabase SQL Editor.
-- ============================================================================

-- ── 1) DISCOUNT OFFERS ──────────────────────────────────────────────────────
-- New offers must be ACTIVE by default and visible to logged-out visitors.
ALTER TABLE public.discount_offers
  ALTER COLUMN is_active SET DEFAULT TRUE;

UPDATE public.discount_offers SET is_active = TRUE WHERE is_active IS NULL;
ALTER TABLE public.discount_offers ALTER COLUMN is_active SET NOT NULL;

-- Seat decay must never start "in the past" for brand new offers
ALTER TABLE public.discount_offers ALTER COLUMN last_decay_at SET DEFAULT now();
UPDATE public.discount_offers SET last_decay_at = COALESCE(last_decay_at, now());

-- Data API access (RLS still decides what is visible)
GRANT SELECT ON public.discount_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_offers TO authenticated;
GRANT ALL ON public.discount_offers TO service_role;

ALTER TABLE public.discount_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers public read active" ON public.discount_offers;
CREATE POLICY "offers public read active" ON public.discount_offers
  FOR SELECT TO anon, authenticated
  USING (
    (is_active = TRUE
      AND seats_remaining > 0
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at   IS NULL OR ends_at   >  now()))
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "offers admin write"  ON public.discount_offers;
DROP POLICY IF EXISTS "offers admin update" ON public.discount_offers;
DROP POLICY IF EXISTS "offers admin delete" ON public.discount_offers;
CREATE POLICY "offers admin write"  ON public.discount_offers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin update" ON public.discount_offers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "offers admin delete" ON public.discount_offers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Realtime so the pricing page reacts the moment an offer is created/toggled
ALTER TABLE public.discount_offers REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.discount_offers;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

-- ── 2) INSTANT JOIN LINK ────────────────────────────────────────────────────
ALTER TABLE public.team_join_forms
  ADD COLUMN IF NOT EXISTS instant_join_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS instant_join_role    TEXT    NOT NULL DEFAULT 'runner',
  ADD COLUMN IF NOT EXISTS instant_join_message TEXT;

DO $$ BEGIN
  ALTER TABLE public.team_join_forms
    ADD CONSTRAINT team_join_forms_instant_role_chk
    CHECK (instant_join_role IN ('editor','runner','viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Members created from the invite link already own their password
ALTER TABLE public.team_members
  ALTER COLUMN must_set_password SET DEFAULT FALSE;

-- One AD4YOU identity per email address, across every team
CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_unique_ci
  ON public.team_members (lower(email));

CREATE INDEX IF NOT EXISTS idx_join_forms_slug ON public.team_join_forms (lower(slug));

-- ── 3) Reload the API schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
