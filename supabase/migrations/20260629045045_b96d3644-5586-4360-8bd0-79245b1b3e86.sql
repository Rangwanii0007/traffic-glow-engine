INSERT INTO public.settings (key, value, type, label, description)
VALUES ('aria_enabled', 'true', 'boolean', 'Aria AI Assistant', 'Show or hide the floating Aria 3D assistant on the website')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.settings TO anon;

DROP POLICY IF EXISTS "Public can read aria_enabled" ON public.settings;
CREATE POLICY "Public can read aria_enabled" ON public.settings
FOR SELECT TO anon, authenticated
USING (key = 'aria_enabled');