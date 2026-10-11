-- AD4YOU — DEMO = SAME REAL FUNCTIONALITY AS PAID PLANS (additive, safe to re-run).
-- Adds 'demo' to every software feature switch so Demo users' links open tabs like Pro/Business.
-- Changes no subscriptions, URLs, teams or prices.
DO $$
DECLARE col_type TEXT;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='feature_flags' AND column_name='allowedPlans';

  IF col_type = 'jsonb' THEN
    UPDATE public.feature_flags
       SET "allowedPlans" = COALESCE("allowedPlans", '[]'::jsonb) || '["demo"]'::jsonb
     WHERE NOT (COALESCE("allowedPlans", '[]'::jsonb) ? 'demo');
  ELSIF col_type = 'json' THEN
    UPDATE public.feature_flags
       SET "allowedPlans" = (COALESCE("allowedPlans"::jsonb, '[]'::jsonb) || '["demo"]'::jsonb)::json
     WHERE NOT (COALESCE("allowedPlans"::jsonb, '[]'::jsonb) ? 'demo');
  ELSIF col_type = 'ARRAY' THEN
    UPDATE public.feature_flags
       SET "allowedPlans" = array_append(COALESCE("allowedPlans", '{}'), 'demo')
     WHERE NOT ('demo' = ANY(COALESCE("allowedPlans", '{}')));
  ELSE -- text holding JSON
    UPDATE public.feature_flags
       SET "allowedPlans" = (COALESCE(NULLIF("allowedPlans", '')::jsonb, '[]'::jsonb) || '["demo"]'::jsonb)::text
     WHERE NOT (COALESCE(NULLIF("allowedPlans", '')::jsonb, '[]'::jsonb) ? 'demo');
  END IF;
END $$;

-- Premium engines switch on for Demo (plan_features has no demo column; the app treats demo like business).
-- Demo warning shown in the user panel.
UPDATE public.plans
   SET is_free = false,
       is_active = true,
       notice_text = 'DEMO VERSION — This is a demonstration package. Only 7 of 113 engines are shown as active in the Demo plan. The full package includes all 113 engines. Purchase any paid package to see all 113 engines active.'
 WHERE lower(slug) = 'demo';

NOTIFY pgrst, 'reload schema';

-- Check: every row should list demo
SELECT key, "isEnabled", "allowedPlans" FROM public.feature_flags ORDER BY key;
