ALTER TABLE public.bot_versions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bot_versions_public_order
  ON public.bot_versions (is_active, sort_order, created_at DESC);

ALTER TABLE public.bot_versions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bot_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_versions;
  END IF;
END
$$;

GRANT SELECT ON public.bot_versions TO anon, authenticated;
GRANT ALL ON public.bot_versions TO service_role;