-- 1. activity_logs: explicit owner-scoped SELECT policy (no broader access)
DROP POLICY IF EXISTS "Users read own logs" ON public.activity_logs;
CREATE POLICY "Users read own logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. reviews: never expose reviewer PII columns through the Data API
REVOKE SELECT ON public.reviews FROM anon, authenticated;
GRANT SELECT (id, user_id, external_user_id, reviewer_name, rating, message, is_approved, created_at, updated_at)
  ON public.reviews TO anon, authenticated;

-- 3. affiliate_referrals: referrers must not read another user's raw email
REVOKE SELECT ON public.affiliate_referrals FROM anon, authenticated;
GRANT SELECT (id, referrer_id, referred_id, status, commission_amount, activated_at, created_at)
  ON public.affiliate_referrals TO authenticated;

-- 4. Realtime: stop broadcasting settings rows (RLS key whitelist is not applied
-- to replication payloads reliably); catalog tables stay published.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.settings';
  END IF;
END $$;
