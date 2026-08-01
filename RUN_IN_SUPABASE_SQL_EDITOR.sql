-- =====================================================================
-- AD4YOU — Fix payout methods saving
-- Run this ONCE in your live project's SQL editor.
--
-- Why: your database already has a `payment_methods` table that belongs to
-- another feature (columns: name/type/logoUrl/link) — it is NOT a per-user
-- payout table. That is why saving failed with
-- "Could not find the 'method_type' column of 'payment_methods'".
-- The app now uses its own table: user_payout_methods.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,          -- wire_bank | bank | paypal | payoneer | crypto
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods TO authenticated;
GRANT ALL ON public.user_payout_methods TO service_role;

ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout own" ON public.user_payout_methods;
CREATE POLICY "payout own" ON public.user_payout_methods
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_payout_methods_user_idx
  ON public.user_payout_methods(user_id);

-- Reload the API schema cache so the app sees the new table immediately.
NOTIFY pgrst, 'reload schema';
