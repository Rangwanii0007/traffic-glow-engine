-- AD4YOU — DEMO PLAN + admin-editable dashboard notice. Safe to re-run.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS notice_text TEXT;

INSERT INTO public.plans (name, title, slug, description, price, currency, duration_days, duration_value, duration_unit, is_free, is_active, is_popular, color, sort_order, notice_text)
SELECT 'Demo', 'Demo Plan', 'demo', 'Demo access assigned by admin', 0, 'USD', 1, 1, 'days', true, true, false, '#ef4444', 0,
       'Demo account: all engines are inactive except 7 of 113 engines. Please get a package for full access.'
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(slug) = 'demo');

UPDATE public.plans
   SET notice_text = 'Demo account: all engines are inactive except 7 of 113 engines. Please get a package for full access.'
 WHERE lower(slug) = 'demo' AND notice_text IS NULL;

NOTIFY pgrst, 'reload schema';
