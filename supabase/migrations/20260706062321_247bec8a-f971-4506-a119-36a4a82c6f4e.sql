
CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'link',
  logo_url text,
  url text,
  value text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platforms TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platforms TO authenticated;
GRANT ALL ON public.platforms TO service_role;

ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active platforms" ON public.platforms
  FOR SELECT USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins manage platforms" ON public.platforms
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER set_platforms_updated_at BEFORE UPDATE ON public.platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Expand public-readable settings
DROP POLICY IF EXISTS "Public can read landing settings" ON public.settings;
DROP POLICY IF EXISTS "Public can read public settings" ON public.settings;

CREATE POLICY "Public can read public settings" ON public.settings
  FOR SELECT USING (key = ANY (ARRAY[
    'aria_enabled','download_url','site_name','site_description',
    'whatsapp_number','support_email','website_url',
    'about_us','contact_info','contact_address','contact_phone'
  ]));

-- Seed content settings
INSERT INTO public.settings (key, value, type, label, description) VALUES
  ('about_us', 'AD4YOU is an AI-powered ad-revenue optimization platform trusted by publishers worldwide. We deliver premium, real-time global traffic to Adsterra, Monetag, and AdSense publishers — engineered for enterprise reliability and undetectable by design.', 'string', 'About Us', 'About Us page content (long text)'),
  ('contact_info', 'We would love to hear from you. Reach out for sales, support, or partnership inquiries — our team responds within 24 hours.', 'string', 'Contact Intro', 'Contact page intro paragraph'),
  ('contact_address', '', 'string', 'Contact Address', 'Physical / mailing address (optional)'),
  ('contact_phone', '', 'string', 'Contact Phone', 'Public phone number (optional)')
ON CONFLICT (key) DO NOTHING;
