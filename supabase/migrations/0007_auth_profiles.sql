-- =============================================================================
-- StudySmart authentication module — profiles + row level security
-- Migration: 0007_auth_profiles.sql
--
-- Turns the minimal public.profiles table (created in 0002) into a real,
-- private user profile keyed to auth.users.id, automatically created on sign-up
-- and readable/writable ONLY by its owner via RLS. Run AFTER 0001-0003.
-- Depends on public.touch_updated_at() (defined in 0001).
-- =============================================================================

-- --- widen the profile ------------------------------------------------------
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Keep the existing updated_at trigger behaviour consistent with the module.
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- --- auto-create a profile for every new auth user --------------------------
-- Runs as the owner (SECURITY DEFINER) so it can write across schemas; it only
-- ever inserts the row belonging to the brand-new user, never anyone else's.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this migration.
insert into public.profiles (id, email)
select u.id, u.email
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- --- RLS: a user may see/edit ONLY their own private profile ----------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No client INSERT/DELETE policy: rows are made by the SECURITY DEFINER trigger
-- above, and an account is removed by deleting the auth user (cascade). The
-- anon/authenticated roles therefore cannot forge or read another profile.

-- Ensure the app roles can use the table under RLS (SELECT/UPDATE only; the
-- definer trigger handles INSERT).
grant select, update on public.profiles to authenticated;
grant execute on function public.handle_new_user() to authenticated;
