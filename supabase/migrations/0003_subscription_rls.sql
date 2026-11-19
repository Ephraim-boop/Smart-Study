-- =============================================================================
-- StudySmart subscription module — row level security + grants
-- Migration: 0003_subscription_rls.sql
-- Principle: clients may READ their own subscription/payments and the public
-- price list, but may NEVER write these tables directly. All writes go through
-- the SECURITY DEFINER functions in 0002, which re-check auth + admin role.
-- =============================================================================

alter table public.subscription_settings     enable row level security;
alter table public.subscriptions             enable row level security;
alter table public.payment_records           enable row level security;
alter table public.payment_verification_logs enable row level security;

-- --- subscription_settings: public pricing is readable by everyone ----------
drop policy if exists settings_public_read on public.subscription_settings;
create policy settings_public_read on public.subscription_settings
  for select
  using (true);
-- (Writes are admin-only via admin_upsert_settings; no client write policies.)

-- --- subscriptions: student reads own; admin reads all ----------------------
drop policy if exists subscriptions_select_own_or_admin on public.subscriptions;
create policy subscriptions_select_own_or_admin on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies => clients cannot modify directly.

-- --- payment_records: student reads own; admin reads all --------------------
drop policy if exists payments_select_own_or_admin on public.payment_records;
create policy payments_select_own_or_admin on public.payment_records
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- Creation happens only inside submit_payment (SECURITY DEFINER).

-- --- payment_verification_logs: admin only ----------------------------------
drop policy if exists logs_select_admin on public.payment_verification_logs;
create policy logs_select_admin on public.payment_verification_logs
  for select
  to authenticated
  using (public.is_admin());

-- --- function grants --------------------------------------------------------
-- Students can submit a payment reference.
revoke execute on function public.submit_payment(text, numeric) from public;
grant execute on function public.submit_payment(text, numeric) to authenticated;

-- Admin functions: granted to authenticated but internally gated by is_admin().
revoke execute on function public.admin_verify_payment(uuid) from public;
revoke execute on function public.admin_reject_payment(uuid, text) from public;
revoke execute on function public.admin_upsert_settings(text, numeric, text, integer, text, text, boolean) from public;
grant execute on function public.admin_verify_payment(uuid) to authenticated;
grant execute on function public.admin_reject_payment(uuid, text) to authenticated;
grant execute on function public.admin_upsert_settings(text, numeric, text, integer, text, text, boolean) to authenticated;
