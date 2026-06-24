
-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- is_admin (SECURITY DEFINER avoids recursive RLS on users)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
$$;

CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin read all users" ON public.users FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin manage all users" ON public.users FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. plans
-- ============================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  duration_days INTEGER DEFAULT 0,
  is_free BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  color TEXT DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role, authenticated;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admin manage plans" ON public.plans FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.plans (name, slug, price, duration_days, is_free, is_popular, color, sort_order, description) VALUES
('Free','free',0,0,true,false,'#6b7280',1,'Perfect for testing our platform'),
('Starter','starter',9.99,30,false,false,'#3b82f6',2,'Great for individuals and small projects'),
('Pro','pro',24.99,30,false,true,'#8b5cf6',3,'For professionals and growing businesses'),
('Business','business',59.99,30,false,false,'#f59e0b',4,'For agencies and large scale operations');

-- ============================================================
-- 3. plan_features
-- ============================================================
CREATE TABLE public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  feature_description TEXT DEFAULT '',
  feature_type TEXT DEFAULT 'boolean' CHECK (feature_type IN ('boolean','number','text')),
  sort_order INTEGER DEFAULT 0,
  free_value TEXT DEFAULT 'false',
  starter_value TEXT DEFAULT 'false',
  pro_value TEXT DEFAULT 'false',
  business_value TEXT DEFAULT 'false',
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT ALL ON public.plan_features TO service_role, authenticated;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read plan features" ON public.plan_features FOR SELECT USING (true);
CREATE POLICY "Admin manage plan features" ON public.plan_features FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.plan_features (feature_key, feature_name, feature_description, feature_type, sort_order, free_value, starter_value, pro_value, business_value) VALUES
('max_urls','Maximum URLs','How many URLs user can add at once','number',1,'1','3','10','50'),
('max_tabs','Concurrent Tabs','How many browser tabs open simultaneously','number',2,'1','3','5','10'),
('max_sessions_daily','Daily Sessions Limit','Maximum bot sessions per day','number',3,'5','50','200','999999'),
('social_traffic','Social Media Traffic','Traffic from 113+ social media platforms','boolean',4,'false','true','true','true'),
('organic_traffic','Organic Search Traffic','Traffic from Google, Bing, Yahoo etc','boolean',5,'true','true','true','true'),
('direct_traffic','Direct Traffic','Direct URL visit traffic','boolean',6,'true','true','true','true'),
('mixed_traffic','Mixed Traffic Mode','Combination of all traffic sources','boolean',7,'false','true','true','true'),
('direct_link_clicker','Direct Link Clicker','Click Adsterra/Monetag direct links automatically','boolean',8,'false','false','true','true'),
('proxy_support','Proxy Support','Add and rotate proxy servers','boolean',9,'false','true','true','true'),
('headless_mode','Headless Mode','Run browser hidden saves RAM','boolean',10,'false','false','true','true'),
('custom_time_per_url','Custom Time Per URL','Set custom visit duration for each URL','boolean',11,'false','true','true','true'),
('cpm_optimizer','CPM Optimizer','AI-powered CPM maximization engine','boolean',12,'false','false','true','true'),
('session_history','Session History','View past bot session records','boolean',13,'false','true','true','true'),
('export_data','Export Data','Export session data to CSV','boolean',14,'false','false','true','true'),
('priority_support','Priority Support','Get faster support responses','boolean',15,'false','false','true','true'),
('api_access','API Access','Access platform APIs programmatically','boolean',16,'false','false','false','true'),
('white_label','White Label','Remove AD4YOU branding','boolean',17,'false','false','false','true');

-- ============================================================
-- 4. subscriptions
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  admin_notes TEXT,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin manage all subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. payments
-- ============================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  crypto_type TEXT,
  transaction_id TEXT,
  nowpayments_id TEXT,
  nowpayments_order_id TEXT,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','confirmed','failed','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin manage all payments" ON public.payments FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 6. bot_sessions
-- ============================================================
CREATE TABLE public.bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  urls_count INTEGER DEFAULT 0,
  traffic_source TEXT DEFAULT 'direct',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  duration_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_sessions TO authenticated;
GRANT ALL ON public.bot_sessions TO service_role;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON public.bot_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all sessions" ON public.bot_sessions FOR SELECT USING (public.is_admin(auth.uid()));

-- ============================================================
-- 7. devices
-- ============================================================
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT DEFAULT 'Unknown Device',
  ip_address TEXT,
  last_login TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own devices" ON public.devices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all devices" ON public.devices FOR SELECT USING (public.is_admin(auth.uid()));

-- ============================================================
-- 8. announcements
-- ============================================================
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  is_active BOOLEAN DEFAULT true,
  show_on_web BOOLEAN DEFAULT true,
  show_in_bot BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT ALL ON public.announcements TO service_role, authenticated;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read active announcements" ON public.announcements FOR SELECT USING (is_active = true);
CREATE POLICY "Admin manage announcements" ON public.announcements FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 9. bot_versions
-- ============================================================
CREATE TABLE public.bot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT UNIQUE NOT NULL,
  download_url TEXT,
  release_notes TEXT,
  file_size TEXT DEFAULT '45 MB',
  is_latest BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false,
  platform TEXT DEFAULT 'windows',
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.bot_versions TO anon, authenticated;
GRANT ALL ON public.bot_versions TO service_role, authenticated;
ALTER TABLE public.bot_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read bot versions" ON public.bot_versions FOR SELECT USING (true);
CREATE POLICY "Admin manage bot versions" ON public.bot_versions FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.bot_versions (version, release_notes, is_latest, file_size) VALUES
('1.0.0','Initial release of AD4YOU Bot with 113+ traffic platforms, anti-detection technology, direct link support, proxy integration, and real-time analytics.',true,'45 MB');

-- ============================================================
-- 10. support_tickets
-- ============================================================
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('bug','feature','billing','account','other')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','replied','closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin manage all tickets" ON public.support_tickets FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER set_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 11. ticket_messages
-- ============================================================
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket participants read messages" ON public.ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_admin(auth.uid())))
);
CREATE POLICY "Participants create ticket messages" ON public.ticket_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- ============================================================
-- 12. contact_messages
-- ============================================================
CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone create contact message" ON public.contact_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin read contact messages" ON public.contact_messages FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin update contact messages" ON public.contact_messages FOR UPDATE USING (public.is_admin(auth.uid()));

-- ============================================================
-- 13. settings
-- ============================================================
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string' CHECK (type IN ('string','boolean','number')),
  label TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role, authenticated;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Admin manage settings" ON public.settings FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER set_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.settings (key, value, type, label, description) VALUES
('site_name','AD4YOU','string','Site Name','Website name'),
('site_description','Ultra-Advanced Traffic Bot Platform','string','Site Description','Website description'),
('support_email','support@ad4you.click','string','Support Email','Support contact email'),
('whatsapp_number','','string','WhatsApp Number','WhatsApp support number'),
('website_url','https://ad4you.click','string','Website URL','Main website URL'),
('maintenance_mode','false','boolean','Maintenance Mode','When enabled bot shows maintenance message'),
('maintenance_message','We are upgrading our servers. Please try again later.','string','Maintenance Message','Message shown during maintenance'),
('bot_latest_version','1.0.0','string','Bot Latest Version','Current latest bot version'),
('force_update','false','boolean','Force Bot Update','When enabled old bot versions cannot be used'),
('auto_activate_payment','true','boolean','Auto Activate on Payment','Automatically activate subscription when crypto payment confirmed'),
('nowpayments_api_key','WPG69MG-F0TM55K-PMDMQ12-PRX3RJD','string','NOWPayments API Key','API key for crypto payments'),
('nowpayments_public_key','54da2d65-b6dc-4e76-b532-70a0c72b8ab3','string','NOWPayments Public Key','Public key for frontend payments');

-- ============================================================
-- 14. activity_logs
-- ============================================================
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read all logs" ON public.activity_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Authenticated insert logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- handle_new_user trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE slug = 'free' LIMIT 1;
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'user')
  ON CONFLICT (id) DO NOTHING;
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status, start_date, end_date, duration_days, created_by)
    VALUES (NEW.id, free_plan_id, 'active', now(), '2099-12-31T23:59:59Z'::timestamptz, 0, 'system')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- expire_overdue_subscriptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_overdue_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscriptions SET status = 'expired'
  WHERE status = 'active' AND end_date < now() AND duration_days > 0;
END; $$;

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_features;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
