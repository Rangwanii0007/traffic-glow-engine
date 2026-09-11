-- AD4YOU — complete multiple software downloads manager
-- Safe to run more than once. Existing rows and links are preserved.

CREATE TABLE IF NOT EXISTS public.bot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  platform TEXT DEFAULT 'windows',
  version TEXT NOT NULL,
  download_url TEXT,
  release_notes TEXT,
  file_size TEXT,
  is_latest BOOLEAN DEFAULT FALSE,
  is_mandatory BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'windows';
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS release_notes TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS file_size TEXT;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT FALSE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
ALTER TABLE public.bot_versions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.bot_versions
SET title = 'AD4YOU for ' || INITCAP(COALESCE(NULLIF(platform, ''), 'Windows')) ||
  CASE WHEN COALESCE(version, '') <> '' THEN ' — v' || version ELSE '' END
WHERE title IS NULL OR btrim(title) = '';

CREATE INDEX IF NOT EXISTS bot_versions_active_order_idx
  ON public.bot_versions (is_active, sort_order, created_at DESC);

GRANT SELECT ON public.bot_versions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bot_versions TO authenticated;
GRANT ALL ON public.bot_versions TO service_role;

ALTER TABLE public.bot_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read bot versions" ON public.bot_versions;
DROP POLICY IF EXISTS "Authenticated read bot versions" ON public.bot_versions;
DROP POLICY IF EXISTS "Public read active bot versions" ON public.bot_versions;
CREATE POLICY "Public read active bot versions"
  ON public.bot_versions FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage bot versions" ON public.bot_versions;
CREATE POLICY "Admin manage bot versions"
  ON public.bot_versions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.bot_versions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bot_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_versions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
