-- AD4YOU — Add manual payment methods (Easypaisa PKR, USD bank, GBP bank).
-- Run AFTER AD4YOU_MANUAL_PAYMENTS.sql. Safe to re-run (skips methods that already exist by name).
-- STEP 1: put YOUR real account details in the values below, then run the whole file.

DO $$
DECLARE
  -- ===== EDIT THESE WITH YOUR REAL DETAILS =====
  ep_account_name   TEXT := 'YOUR EASYPAISA ACCOUNT TITLE';
  ep_account_number TEXT := '03XXXXXXXXX';

  usd_account_name  TEXT := 'YOUR USD ACCOUNT NAME';
  usd_bank_name     TEXT := 'YOUR USD BANK NAME';
  usd_account_no    TEXT := 'YOUR USD ACCOUNT NUMBER';
  usd_iban          TEXT := NULL;   -- or 'IBAN...'

  gbp_account_name  TEXT := 'YOUR GBP ACCOUNT NAME';
  gbp_bank_name     TEXT := 'YOUR UK BANK NAME';
  gbp_account_no    TEXT := 'YOUR UK ACCOUNT NUMBER';
  gbp_sort_code     TEXT := 'XX-XX-XX';
  -- =============================================

  pk UUID; us UUID; gb UUID; intl UUID; m UUID;
BEGIN
  SELECT id INTO pk   FROM public.payment_countries WHERE upper(code)='PK';
  SELECT id INTO us   FROM public.payment_countries WHERE upper(code)='US';
  SELECT id INTO gb   FROM public.payment_countries WHERE upper(code)='GB';
  SELECT id INTO intl FROM public.payment_countries WHERE upper(code)='INTL';
  IF pk IS NULL OR us IS NULL OR gb IS NULL THEN
    RAISE EXCEPTION 'Run AD4YOU_MANUAL_PAYMENTS.sql first (countries missing)';
  END IF;

  -- Easypaisa (Pakistan, PKR)
  IF NOT EXISTS (SELECT 1 FROM public.manual_payment_methods WHERE lower(name)='easypaisa') THEN
    INSERT INTO public.manual_payment_methods (name, category, currency_code, account_name, account_number, instructions, sort_order)
    VALUES ('Easypaisa','wallet','PKR', ep_account_name, ep_account_number,
      'Send the exact PKR amount shown, then upload the screenshot and enter the transaction ID.', 1)
    RETURNING id INTO m;
    INSERT INTO public.manual_payment_method_countries VALUES (m, pk) ON CONFLICT DO NOTHING;
  END IF;

  -- USD bank transfer (USA + other countries)
  IF NOT EXISTS (SELECT 1 FROM public.manual_payment_methods WHERE lower(name)='bank transfer (usd)') THEN
    INSERT INTO public.manual_payment_methods (name, category, currency_code, account_name, bank_name, account_number, iban, instructions, sort_order)
    VALUES ('Bank Transfer (USD)','bank','USD', usd_account_name, usd_bank_name, usd_account_no, usd_iban,
      'Transfer the exact USD amount shown and keep the bank receipt.', 2)
    RETURNING id INTO m;
    INSERT INTO public.manual_payment_method_countries VALUES (m, us) ON CONFLICT DO NOTHING;
    IF intl IS NOT NULL THEN INSERT INTO public.manual_payment_method_countries VALUES (m, intl) ON CONFLICT DO NOTHING; END IF;
  END IF;

  -- GBP bank transfer (United Kingdom)
  IF NOT EXISTS (SELECT 1 FROM public.manual_payment_methods WHERE lower(name)='uk bank transfer (gbp)') THEN
    INSERT INTO public.manual_payment_methods (name, category, currency_code, account_name, bank_name, account_number, branch, instructions, sort_order)
    VALUES ('UK Bank Transfer (GBP)','bank','GBP', gbp_account_name, gbp_bank_name, gbp_account_no, gbp_sort_code,
      'Transfer the exact GBP amount shown. Branch field = sort code.', 3)
    RETURNING id INTO m;
    INSERT INTO public.manual_payment_method_countries VALUES (m, gb) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Check result
SELECT m.name, m.currency_code, m.is_active, string_agg(c.code, ', ') AS countries
FROM public.manual_payment_methods m
LEFT JOIN public.manual_payment_method_countries mc ON mc.method_id = m.id
LEFT JOIN public.payment_countries c ON c.id = mc.country_id
GROUP BY m.id ORDER BY m.sort_order;

NOTIFY pgrst, 'reload schema';
