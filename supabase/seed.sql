-- =============================================================================
-- StudySmart subscription module — default seed prices
-- File: supabase/seed.sql
-- These defaults are administrator-configurable afterwards from the admin
-- dashboard (PriceSettingsEditor). Guinea = 20,000 GNF; Sierra Leone = 20 SLE
-- (SLE denomination kept configurable pending the owner's confirmation).
-- =============================================================================

insert into public.subscription_settings
  (country, monthly_price, currency, period_days, payment_method, payment_recipient, enabled)
values
  ('GN', 20000, 'GNF', 30, 'Orange Money Guinée',     '+22461132905',  true),
  ('SL', 20,    'SLE', 30, 'Orange Money Sierra Leone', '+232079960361', true)
on conflict (country) do update
  set monthly_price = excluded.monthly_price,
      currency = excluded.currency,
      period_days = excluded.period_days,
      payment_method = excluded.payment_method,
      payment_recipient = excluded.payment_recipient,
      enabled = excluded.enabled;
