-- =============================================================================
-- StudySmart subscription module — server-side functions (RPC)
-- Migration: 0002_subscription_functions.sql
-- These are the ONLY sanctioned way to change subscription/payment state.
-- They run as the owner (SECURITY DEFINER) and re-check the caller's role.
-- =============================================================================

-- Minimal profiles lookup. If the wider app already defines public.profiles
-- (id, country, ...) this is a no-op; otherwise it lets the module resolve a
-- student's registered country server-side.
create table if not exists public.profiles (
  id       uuid primary key references auth.users (id) on delete cascade,
  country  text check (country in ('GN', 'SL'))
);

-- Admin detection via the JWT app_metadata.role claim. Assign the 'admin' role
-- to authorized staff in Supabase Auth (see SETUP). Never trust a client flag.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- -----------------------------------------------------------------------------
-- Student: submit an Orange Money transaction reference for verification.
-- Creates a pending_verification payment. Does NOT grant premium access.
-- -----------------------------------------------------------------------------
create or replace function public.submit_payment(
  p_transaction_reference text,
  p_amount_paid numeric
)
returns public.payment_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_country   text;
  v_settings  public.subscription_settings%rowtype;
  v_ref       text := btrim(coalesce(p_transaction_reference, ''));
  v_sub       public.subscriptions%rowtype;
  v_payment   public.payment_records;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED: sign in before submitting a payment';
  end if;
  if v_ref = '' then
    raise exception 'REFERENCE_REQUIRED: a transaction reference is required';
  end if;

  select country into v_country from public.profiles where id = v_uid;
  if v_country is null then
    raise exception 'PROFILE_COUNTRY_MISSING: complete registration (country) first';
  end if;

  select * into v_settings
    from public.subscription_settings
   where country = v_country and enabled
   limit 1;
  if not found then
    raise exception 'NO_ACTIVE_PLAN for country %', v_country;
  end if;

  -- Duplicate-prevention: a reference that has already been accepted cannot be
  -- reused. Reject if this exact reference already exists in any state.
  if exists (select 1 from public.payment_records pr where pr.transaction_reference = v_ref) then
    raise exception 'DUPLICATE_REFERENCE: this transaction reference was already submitted';
  end if;

  -- Ensure a subscription row exists for the student.
  insert into public.subscriptions (user_id, country, status)
    values (v_uid, v_country, 'free')
  on conflict (user_id) do nothing;
  select * into v_sub from public.subscriptions where user_id = v_uid;

  insert into public.payment_records (
    user_id, country, amount, currency, payment_method,
    transaction_reference, recipient_number, status, subscription_id
  ) values (
    v_uid, v_country, p_amount_paid, v_settings.currency, v_settings.payment_method,
    v_ref, v_settings.payment_recipient, 'pending_verification', v_sub.id
  )
  returning * into v_payment;

  -- Mark subscription pending UNLESS premium is currently active (renewal while
  -- active must not lock the student out mid-period).
  update public.subscriptions
     set status = 'pending_verification'
   where id = v_sub.id and status <> 'active';

  return v_payment;
end $$;

-- -----------------------------------------------------------------------------
-- Admin: verify a pending payment -> activate premium for period_days.
-- Idempotent-safe: only a pending_verification payment can be verified.
-- -----------------------------------------------------------------------------
create or replace function public.admin_verify_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  uuid := auth.uid();
  v_pay    public.payment_records;
  v_days   integer;
  v_sub    public.subscriptions;
  v_base   timestamptz;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: administrator role required';
  end if;

  select * into v_pay
    from public.payment_records
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_pay.status <> 'pending_verification' then
    raise exception 'ALREADY_PROCESSED: payment is %', v_pay.status;
  end if;

  select period_days into v_days
    from public.subscription_settings where country = v_pay.country;
  v_days := coalesce(v_days, 30);

  select * into v_sub from public.subscriptions where id = v_pay.subscription_id;
  if v_sub.id is null then
    select * into v_sub from public.subscriptions where user_id = v_pay.user_id;
  end if;

  -- Renew while active extends from the current expiry; otherwise from now.
  if v_sub.status = 'active' and v_sub.expiry_date is not null and v_sub.expiry_date > now() then
    v_base := v_sub.expiry_date;
  else
    v_base := now();
  end if;

  update public.subscriptions
     set status = 'active',
         activation_date = now(),
         expiry_date = v_base + (v_days || ' days')::interval
   where id = v_sub.id;

  update public.payment_records
     set status = 'verified', verified_at = now(), verified_by = v_admin,
         subscription_id = v_sub.id
   where id = v_pay.id;

  insert into public.payment_verification_logs
    (payment_id, admin_id, action, reference, amount, currency, country)
  values
    (v_pay.id, v_admin, 'verify', v_pay.transaction_reference, v_pay.amount,
     v_pay.currency, v_pay.country);
end $$;

-- -----------------------------------------------------------------------------
-- Admin: reject an invalid/duplicate payment claim with a reason.
-- -----------------------------------------------------------------------------
create or replace function public.admin_reject_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_pay   public.payment_records;
  v_sub   public.subscriptions;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: administrator role required';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'REASON_REQUIRED: provide a rejection reason for the student';
  end if;

  select * into v_pay from public.payment_records where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_pay.status <> 'pending_verification' then
    raise exception 'ALREADY_PROCESSED: payment is %', v_pay.status;
  end if;

  update public.payment_records
     set status = 'rejected', rejection_reason = p_reason,
         verified_at = now(), verified_by = v_admin
   where id = v_pay.id;

  -- Do not disturb an active subscription (renewal that was rejected); otherwise
  -- the pending subscription becomes rejected so the student sees why.
  if v_pay.subscription_id is not null then
    update public.subscriptions
       set status = 'rejected'
     where id = v_pay.subscription_id and status = 'pending_verification';
  end if;

  insert into public.payment_verification_logs
    (payment_id, admin_id, action, reference, amount, currency, country, reason)
  values
    (v_pay.id, v_admin, 'reject', v_pay.transaction_reference, v_pay.amount,
     v_pay.currency, v_pay.country, p_reason);
end $$;

-- -----------------------------------------------------------------------------
-- Admin: create/update pricing + payment settings for a country.
-- -----------------------------------------------------------------------------
create or replace function public.admin_upsert_settings(
  p_country text,
  p_monthly_price numeric,
  p_currency text,
  p_period_days integer,
  p_payment_method text,
  p_payment_recipient text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: administrator role required';
  end if;
  if p_country not in ('GN', 'SL') then
    raise exception 'INVALID_COUNTRY';
  end if;
  if p_period_days is null or p_period_days <= 0 then
    raise exception 'INVALID_PERIOD';
  end if;
  if p_monthly_price is null or p_monthly_price < 0 then
    raise exception 'INVALID_PRICE';
  end if;

  insert into public.subscription_settings
    (country, monthly_price, currency, period_days, payment_method, payment_recipient, enabled)
  values
    (p_country, p_monthly_price, upper(p_currency), p_period_days,
     p_payment_method, p_payment_recipient, p_enabled)
  on conflict (country) do update
    set monthly_price = excluded.monthly_price,
        currency = excluded.currency,
        period_days = excluded.period_days,
        payment_method = excluded.payment_method,
        payment_recipient = excluded.payment_recipient,
        enabled = excluded.enabled;
end $$;
