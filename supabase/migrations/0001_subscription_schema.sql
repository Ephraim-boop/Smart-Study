-- =============================================================================
-- StudySmart subscription module — schema
-- Migration: 0001_subscription_schema.sql
-- Idempotent-ish: run once against your Supabase Postgres (SQL Editor / CLI).
-- =============================================================================

-- Status enums mirror the TypeScript union in src/subscription/types.
do $$ begin
  create type public.subscription_status as enum
    ('free', 'pending_verification', 'active', 'expired', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum
    ('pending_verification', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

-- Administrator-configurable pricing / payment settings per country.
-- This is the single source of truth for the advertised price + currency.
create table if not exists public.subscription_settings (
  country            text primary key check (country in ('GN', 'SL')),
  monthly_price      numeric(14,2) not null check (monthly_price >= 0),
  currency           text not null,
  period_days        integer not null default 30 check (period_days > 0),
  payment_method     text not null,
  payment_recipient  text not null,
  enabled            boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- One subscription row per student. Premium is granted ONLY via the admin
-- verification RPC. On expiry the row flips to 'expired'; nothing is deleted.
create table if not exists public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users (id) on delete cascade,
  country          text not null check (country in ('GN', 'SL')),
  status           public.subscription_status not null default 'free',
  activation_date  timestamptz,
  expiry_date      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- Manual Orange Money payment claims. The transaction_reference UNIQUE index
-- prevents activating Premium twice for the same payment (Section 12).
create table if not exists public.payment_records (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  country               text not null check (country in ('GN', 'SL')),
  amount                numeric(14,2) not null check (amount >= 0),
  currency              text not null,
  payment_method        text not null,
  transaction_reference text not null,
  recipient_number      text not null,
  status                public.payment_status not null default 'pending_verification',
  rejection_reason      text,
  subscription_id       uuid references public.subscriptions (id) on delete set null,
  submitted_at          timestamptz not null default now(),
  verified_at           timestamptz,
  verified_by           uuid references auth.users (id) on delete set null,
  -- Duplicate references are blocked. Two distinct payments may share a
  -- reference only if the earlier one was never accepted, which we disallow,
  -- so the unique index is on the reference itself.
  constraint payment_records_reference_unique unique (transaction_reference)
);
create index if not exists payment_records_user_idx on public.payment_records (user_id);
create index if not exists payment_records_status_idx on public.payment_records (status);

-- Immutable audit log: every verify/reject action is recorded here.
create table if not exists public.payment_verification_logs (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payment_records (id) on delete cascade,
  admin_id     uuid references auth.users (id) on delete set null,
  action       text not null check (action in ('verify', 'reject')),
  reference    text not null,
  amount       numeric(14,2) not null,
  currency     text not null,
  country      text not null,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists verification_logs_payment_idx on public.payment_verification_logs (payment_id);

-- Keep updated_at fresh on mutable tables.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.subscription_settings;
create trigger settings_touch before update on public.subscription_settings
  for each row execute function public.touch_updated_at();
