-- =====================================================================
-- AD4YOU — Plan system + payment_methods schema-cache fix
-- Run this ONCE in your Supabase SQL editor (sxaaamdvzajyanaxmecy project)
-- =====================================================================

-- 1) Ensure is_default exists on payment_methods (fixes "schema cache" error)
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- 2) Add plan capability/limit columns for bot enforcement
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_pcs INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_visits_per_day INTEGER DEFAULT 1000, -- NULL/-1 = unlimited
  ADD COLUMN IF NOT EXISTS max_device_profiles INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS engines_enabled TEXT DEFAULT 'basic', -- basic | all
  ADD COLUMN IF NOT EXISTS team_features TEXT DEFAULT 'none',    -- none | basic | full
  ADD COLUMN IF NOT EXISTS max_team_members INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_support BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS api_access BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS custom_branding BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_per_seat BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_seats INTEGER DEFAULT 1;

-- 3) Seed / upsert the 4 core plans with exact limits
INSERT INTO public.plans
  (slug, name, description, price, duration_days, is_free, is_active, is_popular, color, sort_order,
   max_pcs, max_visits_per_day, max_device_profiles, engines_enabled, team_features, max_team_members,
   priority_support, api_access, custom_branding, is_per_seat, min_seats)
VALUES
  ('starter',  'Starter',   '1 PC · 1,000 visits/day · basic engines',        9.99,  30, false, true, false, '#3b82f6', 10,
     1,   1000, 15, 'basic', 'none', 0, false, false, false, false, 1),
  ('pro',      'Pro',       '5 PCs · 10,000 visits/day · ALL 28 engines',    24.99,  30, false, true, true,  '#8b5cf6', 20,
     5,  10000, 15, 'all',   'none', 0, true,  false, false, false, 1),
  ('business', 'Business',  '15 PCs · unlimited visits · basic team (3)',    59.99,  30, false, true, false, '#f59e0b', 30,
    15,     -1, 15, 'all',   'basic', 3, true, false, false, false, 1),
  ('teamwork', 'Team Work', '$15/PC/month · unlimited · full team suite',    15.00,  30, false, true, false, '#10b981', 40,
    -1,     -1, 15, 'all',   'full', -1, true, true,  true,  true,  5)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  duration_days = EXCLUDED.duration_days,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  max_pcs = EXCLUDED.max_pcs,
  max_visits_per_day = EXCLUDED.max_visits_per_day,
  max_device_profiles = EXCLUDED.max_device_profiles,
  engines_enabled = EXCLUDED.engines_enabled,
  team_features = EXCLUDED.team_features,
  max_team_members = EXCLUDED.max_team_members,
  priority_support = EXCLUDED.priority_support,
  api_access = EXCLUDED.api_access,
  custom_branding = EXCLUDED.custom_branding,
  is_per_seat = EXCLUDED.is_per_seat,
  min_seats = EXCLUDED.min_seats;

-- 4) Extend subscriptions with per-seat count (Team Work plan)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS seats INTEGER DEFAULT 1;

-- 5) PC / device tracking for login enforcement (bot uses this)
CREATE TABLE IF NOT EXISTS public.pc_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  hostname TEXT,
  os TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, machine_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pc_registrations TO authenticated;
GRANT ALL ON public.pc_registrations TO service_role;
ALTER TABLE public.pc_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc own" ON public.pc_registrations;
CREATE POLICY "pc own" ON public.pc_registrations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6) Daily visit counters (bot uses this for visits/day quota)
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  visits INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage own" ON public.usage_counters;
CREATE POLICY "usage own" ON public.usage_counters
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 7) Team members (Business + Team Work plans)
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  invited_email TEXT,
  role TEXT NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | revoked
  locked_settings BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, member_user_id),
  UNIQUE(owner_id, invited_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team owner manage" ON public.team_members;
CREATE POLICY "team owner manage" ON public.team_members
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR member_user_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 8) Bot API: single RPC bot calls to fetch effective entitlements
--    Bot passes user's Supabase JWT; this returns plan + limits + today's usage.
CREATE OR REPLACE FUNCTION public.get_bot_entitlements(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'plan', COALESCE(p.slug, 'free'),
    'plan_name', COALESCE(p.name, 'Free'),
    'subscription_status', COALESCE(s.status, 'none'),
    'expires_at', s.end_date,
    'seats', COALESCE(s.seats, 1),
    'limits', jsonb_build_object(
      'max_pcs', COALESCE(p.max_pcs, 1) * COALESCE(s.seats, 1),
      'max_visits_per_day', COALESCE(p.max_visits_per_day, 1000),
      'max_device_profiles', COALESCE(p.max_device_profiles, 15),
      'engines_enabled', COALESCE(p.engines_enabled, 'basic'),
      'team_features', COALESCE(p.team_features, 'none'),
      'max_team_members', COALESCE(p.max_team_members, 0),
      'priority_support', COALESCE(p.priority_support, false),
      'api_access', COALESCE(p.api_access, false),
      'custom_branding', COALESCE(p.custom_branding, false)
    ),
    'usage_today', jsonb_build_object(
      'visits', COALESCE((SELECT visits FROM public.usage_counters
                          WHERE user_id = u.id AND day = CURRENT_DATE), 0),
      'pcs_registered', (SELECT COUNT(*) FROM public.pc_registrations WHERE user_id = u.id)
    )
  ) INTO result
  FROM public.users u
  LEFT JOIN public.subscriptions s ON s.user_id = u.id AND s.status = 'active'
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE u.id = _user_id;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_bot_entitlements(UUID) TO authenticated, anon, service_role;

-- 9) Bot: register a PC (enforces max_pcs)
CREATE OR REPLACE FUNCTION public.register_pc(_machine_id TEXT, _hostname TEXT, _os TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  allowed INTEGER;
  used INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT COALESCE(p.max_pcs, 1) * COALESCE(s.seats, 1) INTO allowed
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = uid AND s.status = 'active';
  allowed := COALESCE(allowed, 1);

  -- Update or insert; count only if new
  IF EXISTS (SELECT 1 FROM public.pc_registrations WHERE user_id = uid AND machine_id = _machine_id) THEN
    UPDATE public.pc_registrations SET last_seen_at = now(), hostname = _hostname, os = _os
      WHERE user_id = uid AND machine_id = _machine_id;
    RETURN jsonb_build_object('ok', true, 'new', false);
  END IF;

  SELECT COUNT(*) INTO used FROM public.pc_registrations WHERE user_id = uid;
  IF allowed > 0 AND used >= allowed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pc_limit_reached', 'allowed', allowed, 'used', used);
  END IF;

  INSERT INTO public.pc_registrations(user_id, machine_id, hostname, os) VALUES (uid, _machine_id, _hostname, _os);
  RETURN jsonb_build_object('ok', true, 'new', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_pc(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 10) Bot: increment daily visits (enforces max_visits_per_day)
CREATE OR REPLACE FUNCTION public.increment_visits(_count INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  limit_visits INTEGER;
  current_visits INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT COALESCE(p.max_visits_per_day, 1000) INTO limit_visits
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = uid AND s.status = 'active';
  limit_visits := COALESCE(limit_visits, 1000);

  INSERT INTO public.usage_counters(user_id, day, visits)
  VALUES (uid, CURRENT_DATE, _count)
  ON CONFLICT (user_id, day) DO UPDATE SET visits = public.usage_counters.visits + _count, updated_at = now()
  RETURNING visits INTO current_visits;

  IF limit_visits > 0 AND current_visits > limit_visits THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit_reached',
                              'limit', limit_visits, 'used', current_visits);
  END IF;
  RETURN jsonb_build_object('ok', true, 'used', current_visits, 'limit', limit_visits);
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_visits(INTEGER) TO authenticated, service_role;

-- 11) CRITICAL: reload PostgREST schema cache so all changes are picked up
NOTIFY pgrst, 'reload schema';
