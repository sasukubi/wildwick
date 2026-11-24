-- =============================================================
-- Wildwick database setup (version 1.2)
-- Run this once in Supabase: SQL Editor -> New query -> paste all of it -> Run.
-- It's safe to run again: it only adds what's missing.
--
--  * characters: each account's character, with its class levels,
--    skill trees, prestiges, coins and items. Only you can see or change yours.
--  * runs: the leaderboard (daily runs and endless runs). Everyone can read it;
--    you can only add your own runs, and your username is filled in for you.
--  Usernames are unique: Supabase only allows one account per username.
-- =============================================================

-- ---------- characters ----------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.characters enable row level security;

drop policy if exists "players read their own characters" on public.characters;
drop policy if exists "players create their own characters" on public.characters;
drop policy if exists "players update their own characters" on public.characters;
drop policy if exists "players delete their own characters" on public.characters;
create policy "players read their own characters" on public.characters for select using (auth.uid() = user_id);
create policy "players create their own characters" on public.characters for insert with check (auth.uid() = user_id);
create policy "players update their own characters" on public.characters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "players delete their own characters" on public.characters for delete using (auth.uid() = user_id);

-- ---------- leaderboard ----------
create table if not exists public.runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username text not null default '',
  mode text not null check (mode in ('daily', 'endless')),
  day date not null default current_date,
  forests int not null default 0 check (forests between 0 and 10000),
  time_s int not null default 0 check (time_s between 0 and 1000000),
  won boolean not null default false,
  party text[] not null default '{}',
  classes text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists runs_board on public.runs (mode, day, forests desc, time_s);
alter table public.runs enable row level security;

drop policy if exists "anyone can read the leaderboard" on public.runs;
drop policy if exists "players add their own runs" on public.runs;
create policy "anyone can read the leaderboard" on public.runs for select using (true);
create policy "players add their own runs" on public.runs for insert with check (auth.uid() = user_id);

-- the username on a run always comes from the account that saved it (nobody can fake it)
create or replace function public.runs_set_username() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.username := coalesce((select raw_user_meta_data ->> 'username' from auth.users where id = auth.uid()), '');
  return new;
end $$;
drop trigger if exists runs_username on public.runs;
create trigger runs_username before insert on public.runs for each row execute function public.runs_set_username();

-- ---------- let the game use the tables ----------
-- (newer Supabase projects don't do this automatically; the security rules above still apply)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select on public.runs to anon, authenticated;
grant insert on public.runs to authenticated;
