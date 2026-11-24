-- Wildwick: run this once in Supabase (SQL Editor -> New query -> paste -> Run).
-- It creates the table that stores each account's characters,
-- and makes sure players can only see and change their own.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;

create policy "players read their own characters"
  on public.characters for select using (auth.uid() = user_id);

create policy "players create their own characters"
  on public.characters for insert with check (auth.uid() = user_id);

create policy "players update their own characters"
  on public.characters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "players delete their own characters"
  on public.characters for delete using (auth.uid() = user_id);
