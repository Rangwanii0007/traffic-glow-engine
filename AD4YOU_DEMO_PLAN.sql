-- AD4YOU — ADMIN-ASSIGNED FULL-ACCESS DEMO + LEGACY URL CLEANUP.
-- Safe to re-run. Demo is hidden from checkout in the app and can only be assigned by admin.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS notice_text TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_pcs INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_team_members INTEGER;

INSERT INTO public.plans (name, title, slug, description, price, currency, duration_days, duration_value, duration_unit, is_free, is_active, is_popular, color, sort_order, notice_text)
SELECT 'Demo', 'Demo Access', 'demo', 'Full-access demo assigned by admin', 0, 'USD', 1, 1, 'days', false, true, false, '#ef4444', 0,
       'Demo access is active with full engine access. This is a limited-time package; upgrade to continue after it expires.'
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(slug) = 'demo');

UPDATE public.plans
   SET name = 'Demo',
       title = COALESCE(NULLIF(title, ''), 'Demo Access'),
       description = COALESCE(NULLIF(description, ''), 'Full-access demo assigned by admin'),
       is_free = false,
       is_active = true,
       max_pcs = COALESCE(
         max_pcs,
         (SELECT COALESCE(p.max_pcs, p.max_team_members) FROM public.plans p WHERE lower(p.slug) = 'business' ORDER BY p.created_at LIMIT 1),
         200
       ),
       max_team_members = COALESCE(
         max_team_members,
         (SELECT COALESCE(p.max_team_members, p.max_pcs) FROM public.plans p WHERE lower(p.slug) = 'business' ORDER BY p.created_at LIMIT 1),
         200
       ),
       notice_text = CASE
         WHEN notice_text IS NULL
           OR notice_text ILIKE '%all engines are inactive%'
           OR notice_text ILIKE '%7 of 113%'
         THEN 'Demo access is active with full engine access. This is a limited-time package; upgrade to continue after it expires.'
         ELSE notice_text
       END
 WHERE lower(slug) = 'demo';

-- Remove only the obsolete default site from saved team URL lists.
-- Custom URLs and every other saved entry are preserved.
DO $$
BEGIN
  IF to_regclass('public.team_configurations') IS NOT NULL THEN
    UPDATE public.team_configurations
       SET urls_list = COALESCE((
         SELECT jsonb_agg(entry)
           FROM jsonb_array_elements(COALESCE(urls_list, '[]'::jsonb)) AS entry
          WHERE lower(rtrim(CASE
            WHEN jsonb_typeof(entry) = 'string' THEN entry #>> '{}'
            ELSE COALESCE(entry ->> 'url', '')
          END, '/')) NOT IN (
            'http://scholars4dev.com', 'http://www.scholars4dev.com',
            'https://scholars4dev.com', 'https://www.scholars4dev.com'
          )
       ), '[]'::jsonb)
     WHERE urls_list::text ILIKE '%scholars4dev.com%';
  END IF;

  IF to_regclass('public.teams') IS NOT NULL THEN
    UPDATE public.teams
       SET locked_urls = COALESCE((
         SELECT jsonb_agg(entry)
           FROM jsonb_array_elements(COALESCE(locked_urls, '[]'::jsonb)) AS entry
          WHERE lower(rtrim(CASE
            WHEN jsonb_typeof(entry) = 'string' THEN entry #>> '{}'
            ELSE COALESCE(entry ->> 'url', '')
          END, '/')) NOT IN (
            'http://scholars4dev.com', 'http://www.scholars4dev.com',
            'https://scholars4dev.com', 'https://www.scholars4dev.com'
          )
       ), '[]'::jsonb)
     WHERE locked_urls::text ILIKE '%scholars4dev.com%';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
