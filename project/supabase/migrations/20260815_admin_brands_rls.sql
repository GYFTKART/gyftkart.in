-- Run this in Supabase Dashboard → SQL Editor.
--
-- CONTEXT: an earlier run partially failed because a pre-existing
-- `public.admins` table (columns: just `email text`, no `id`, no
-- link to auth.users — unused by any current app code) already
-- occupied the name, so `create table if not exists` silently kept
-- it instead of creating ours. The script then errored on the very
-- first policy that referenced `admins.id`, which stopped everything
-- after it — so the brands write policies never got created either.
-- This version drops that unused old table first, then does
-- everything in the right order.

-- 1. Remove the old, unrelated admins(email) table. Safe to drop:
-- nothing in AdminAuthContext.tsx or BrandManager.tsx reads from it.
drop table if exists public.admins cascade;

-- 2. Recreate it with the schema our RLS policies actually need.
create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins can read own row" on public.admins;
create policy "admins can read own row"
  on public.admins
  for select
  to authenticated
  using (id = auth.uid());

-- 3. Register your admin account (the Supabase Auth user you created
-- earlier for gyftkart@gmail.com).
insert into public.admins (id)
select id from auth.users where email = 'gyftkart@gmail.com'
on conflict (id) do nothing;

-- 4. brands table: the original schema only ever created a SELECT
-- policy — INSERT/UPDATE/DELETE were never covered, which is the
-- root cause of the original 403. Adding those now.
alter table public.brands enable row level security;

drop policy if exists "admins can insert brands" on public.brands;
create policy "admins can insert brands"
  on public.brands
  for insert
  to authenticated
  with check (exists (select 1 from public.admins where admins.id = auth.uid()));

drop policy if exists "admins can update brands" on public.brands;
create policy "admins can update brands"
  on public.brands
  for update
  to authenticated
  using (exists (select 1 from public.admins where admins.id = auth.uid()))
  with check (exists (select 1 from public.admins where admins.id = auth.uid()));

drop policy if exists "admins can delete brands" on public.brands;
create policy "admins can delete brands"
  on public.brands
  for delete
  to authenticated
  using (exists (select 1 from public.admins where admins.id = auth.uid()));

-- 5. Sanity check — should return exactly one row: your admin's UID.
select * from public.admins;
