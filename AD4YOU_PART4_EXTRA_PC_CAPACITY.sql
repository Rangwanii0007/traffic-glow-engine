-- ============================================================
-- AD4YOU — PART 4: EXTRA PC CAPACITY (ADD-ONS)
-- Safe to run multiple times in the Supabase SQL Editor.
-- Additive only: nothing is dropped, no data is deleted.
-- Requires: AD4YOU_FLEXIBLE_PLANS_AND_TIME_PACKAGES.sql
--           AD4YOU_PART2_PLAN_DATABASE.sql
-- ============================================================

-- ---------- 1. Keep both capacity columns in sync ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_pcs INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_team_members INTEGER;

UPDATE public.plans SET max_team_members = max_pcs
 WHERE max_team_members IS NULL AND max_pcs IS NOT NULL;
UPDATE public.plans SET max_pcs = max_team_members
 WHERE max_pcs IS NULL AND max_team_members IS NOT NULL;

-- ---------- 2. Extra PC capacity add-ons ----------
CREATE TABLE IF NOT EXISTS public.capacity_addons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extra_pcs    INTEGER NOT NULL DEFAULT 0,
  price        NUMERIC NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  label        TEXT,
  note         TEXT,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means: follows the user's current subscription expiry
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT NOT NULL DEFAULT 'admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capacity_addons_user_idx   ON public.capacity_addons(user_id, is_active);
CREATE INDEX IF NOT EXISTS capacity_addons_expiry_idx ON public.capacity_addons(expires_at);

GRANT SELECT ON public.capacity_addons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.capacity_addons TO authenticated;
GRANT ALL ON public.capacity_addons TO service_role;

ALTER TABLE public.capacity_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capacity_addons_read_own_or_admin" ON public.capacity_addons;
CREATE POLICY "capacity_addons_read_own_or_admin" ON public.capacity_addons
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_insert" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_insert" ON public.capacity_addons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_update" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_update" ON public.capacity_addons
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "capacity_addons_admin_delete" ON public.capacity_addons;
CREATE POLICY "capacity_addons_admin_delete" ON public.capacity_addons
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_capacity_addons_updated_at ON public.capacity_addons;
CREATE TRIGGER trg_capacity_addons_updated_at BEFORE UPDATE ON public.capacity_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. Realtime ----------
ALTER TABLE public.capacity_addons REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.capacity_addons;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ---------- 4. Reload API schema cache ----------
NOTIFY pgrst, 'reload schema';
