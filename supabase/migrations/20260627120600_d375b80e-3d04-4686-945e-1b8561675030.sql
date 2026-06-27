
-- 1) activity_logs: bind inserts to auth.uid()
DROP POLICY IF EXISTS "Authenticated insert logs" ON public.activity_logs;
CREATE POLICY "Users insert own logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 2) users: prevent self role / ban escalation. Replace permissive update policy.
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users update own profile (safe fields)"
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND is_banned = (SELECT is_banned FROM public.users WHERE id = auth.uid())
    AND ban_reason IS NOT DISTINCT FROM (SELECT ban_reason FROM public.users WHERE id = auth.uid())
  );

-- Admin-only policy for role/ban changes (separate, explicit)
DROP POLICY IF EXISTS "Admins update any user" ON public.users;
CREATE POLICY "Admins update any user"
  ON public.users FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) settings: confirm admin-only SELECT (drops any lingering permissive policy)
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can read settings" ON public.settings;
