
-- Restrict settings to admin-only reads
DROP POLICY IF EXISTS "Anyone read settings" ON public.settings;
CREATE POLICY "Admins read settings" ON public.settings FOR SELECT USING (public.is_admin(auth.uid()));

-- Restrict bot_versions to authenticated users
DROP POLICY IF EXISTS "Anyone read bot versions" ON public.bot_versions;
CREATE POLICY "Authenticated read bot versions" ON public.bot_versions FOR SELECT TO authenticated USING (true);

-- Prevent self privilege escalation on users table
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND is_banned IS NOT DISTINCT FROM (SELECT is_banned FROM public.users WHERE id = auth.uid())
  );
