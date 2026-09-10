-- AD4YOU — multiple download options (safe to run more than once)
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS bot_versions_active_order_idx
  ON public.bot_versions (is_active, sort_order, created_at DESC);

-- Keep the original single link working as the first option if nothing else is set up
UPDATE public.bot_versions
   SET title = COALESCE(NULLIF(title, ''), 'AD4YOU for ' || INITCAP(COALESCE(platform, 'Windows')) || ' — v' || version)
 WHERE title IS NULL OR title = '';

-- Instant updates on the public pages
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_versions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
