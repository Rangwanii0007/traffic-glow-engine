CREATE TABLE public.user_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('wire_bank', 'bank', 'paypal', 'payoneer', 'crypto')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_methods TO authenticated;
GRANT ALL ON public.user_payout_methods TO service_role;

ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own payout methods"
ON public.user_payout_methods FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Members add own payout methods"
ON public.user_payout_methods FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members update own payout methods"
ON public.user_payout_methods FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members delete own payout methods"
ON public.user_payout_methods FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX user_payout_methods_user_idx ON public.user_payout_methods(user_id);
CREATE UNIQUE INDEX user_payout_methods_one_default_idx
ON public.user_payout_methods(user_id) WHERE is_default = TRUE;

CREATE TRIGGER user_payout_methods_updated_at
BEFORE UPDATE ON public.user_payout_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';