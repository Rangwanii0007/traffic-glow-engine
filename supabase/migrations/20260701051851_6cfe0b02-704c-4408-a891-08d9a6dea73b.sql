
-- Add download_url setting for landing page download button
INSERT INTO public.settings (key, value, type, label, description)
VALUES ('download_url', '', 'string', 'AD4YOU.exe Download URL', 'Direct URL served to users on the Location page download button')
ON CONFLICT (key) DO NOTHING;

-- Broaden public read policy to also expose download_url alongside aria_enabled
DROP POLICY IF EXISTS "Public can read aria_enabled" ON public.settings;
CREATE POLICY "Public can read landing settings"
ON public.settings FOR SELECT
TO anon, authenticated
USING (key IN ('aria_enabled', 'download_url', 'site_name'));

-- Enable realtime for settings so admin toggles propagate instantly
ALTER TABLE public.settings REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'settings';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.settings';
  END IF;
END $$;
