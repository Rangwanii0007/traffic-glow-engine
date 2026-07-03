
-- Grant PostgREST access to tables that were missing GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_offers TO authenticated;
GRANT SELECT ON public.discount_offers TO anon;
GRANT ALL ON public.discount_offers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_withdrawals TO authenticated;
GRANT ALL ON public.affiliate_withdrawals TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

-- Ensure aria_enabled + download_url settings rows exist with correct metadata
INSERT INTO public.settings (key, value, type, label, description)
VALUES
  ('aria_enabled','true','boolean','Aria AI Assistant','Show or hide the floating Aria 3D assistant on the website'),
  ('download_url','','string','Bot Download URL','Direct download URL for the AD4YOU desktop bot (updated by admin)')
ON CONFLICT (key) DO UPDATE
SET type = EXCLUDED.type, label = EXCLUDED.label, description = EXCLUDED.description;

-- Reload PostgREST schema cache so the API sees the new grants immediately
NOTIFY pgrst, 'reload schema';
