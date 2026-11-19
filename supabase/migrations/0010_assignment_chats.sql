-- =============================================================================
-- StudySmart Assignment Solver — private student conversation history
-- Migration: 0010_assignment_chats.sql
--
-- Chat rows are account-scoped by RLS. Uploaded image bytes are never stored;
-- messages contain the student's text and AI responses for conversation context.
-- =============================================================================

create table if not exists public.assignment_chats (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists assignment_chats_user_updated_idx
  on public.assignment_chats (user_id, updated_at desc);

drop trigger if exists assignment_chats_touch_updated_at on public.assignment_chats;
create trigger assignment_chats_touch_updated_at
  before update on public.assignment_chats
  for each row execute function public.touch_updated_at();

alter table public.assignment_chats enable row level security;

drop policy if exists assignment_chats_select_self on public.assignment_chats;
create policy assignment_chats_select_self on public.assignment_chats
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists assignment_chats_insert_self on public.assignment_chats;
create policy assignment_chats_insert_self on public.assignment_chats
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists assignment_chats_update_self on public.assignment_chats;
create policy assignment_chats_update_self on public.assignment_chats
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists assignment_chats_delete_self on public.assignment_chats;
create policy assignment_chats_delete_self on public.assignment_chats
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.assignment_chats to authenticated;
