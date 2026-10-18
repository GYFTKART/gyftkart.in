-- 20261018230000_security_rls_hardening.sql
--
-- Comprehensive Supabase Database & RLS Security Hardening
-- Enforces strict Row Level Security across all application tables:
--   1. profiles: owner read/write (auth.uid() = id), admin full management
--   2. orders: owner read (auth.uid() = user_id), admin full management, NO client delete/update
--   3. upi_payment_sessions: owner read (auth.uid() = user_id), admin read/update, NO client delete/update
--   4. wallet_transactions: append-only ledger; owner read only; mutations via SECURITY DEFINER RPCs only
--   5. wallets: owner read only (auth.uid() = user_id); mutations via SECURITY DEFINER RPCs only
--   6. brands: public catalog read, admin write/update/delete only
--   7. company_ledger: strictly admin only (exists in public.admins)
--   8. corporate_inquiries: public submission, admin only reading and status updating

-- =============================================================================
-- 1. PROFILES TABLE RLS HARDENING
-- =============================================================================
alter table if exists public.profiles enable row level security;

-- Authenticated users can read their own profile row
drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Authenticated users can update their own profile row
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Verified admins can read and manage all profiles
drop policy if exists "admins_manage_profiles" on public.profiles;
create policy "admins_manage_profiles"
  on public.profiles
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

-- =============================================================================
-- 2. ORDERS TABLE RLS HARDENING
-- =============================================================================
alter table if exists public.orders enable row level security;

-- Customers can only read their own orders
drop policy if exists "orders_owner_select" on public.orders;
create policy "orders_owner_select"
  on public.orders
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Admins can read all orders
drop policy if exists "admins_read_orders" on public.orders;
create policy "admins_read_orders"
  on public.orders
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Admins can manage orders
drop policy if exists "admins_manage_orders" on public.orders;
create policy "admins_manage_orders"
  on public.orders
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Explicitly revoke direct client delete/update on orders
revoke update, delete on public.orders from anon;

-- =============================================================================
-- 3. UPI_PAYMENT_SESSIONS RLS HARDENING
-- =============================================================================
alter table if exists public.upi_payment_sessions enable row level security;

-- Users can read their own payment sessions
drop policy if exists "upi_sessions_owner_select" on public.upi_payment_sessions;
create policy "upi_sessions_owner_select"
  on public.upi_payment_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Admins can read all payment sessions
drop policy if exists "admins_read_upi_sessions" on public.upi_payment_sessions;
create policy "admins_read_upi_sessions"
  on public.upi_payment_sessions
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Admins can update payment session status and verification details
drop policy if exists "admins_update_upi_sessions" on public.upi_payment_sessions;
create policy "admins_update_upi_sessions"
  on public.upi_payment_sessions
  for update
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Revoke direct client-side UPDATE and DELETE permissions
revoke update, delete on public.upi_payment_sessions from anon;

-- =============================================================================
-- 4. WALLET_TRANSACTIONS RLS HARDENING (APPEND-ONLY LEDGER)
-- =============================================================================
alter table if exists public.wallet_transactions enable row level security;

-- Users can only view their own transactions
drop policy if exists "Wallet tx: owner select" on public.wallet_transactions;
create policy "Wallet tx: owner select"
  on public.wallet_transactions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admins can audit all wallet ledger entries
drop policy if exists "admins_read_wallet_transactions" on public.wallet_transactions;
create policy "admins_read_wallet_transactions"
  on public.wallet_transactions
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Strictly forbid client-side write/update/delete; ledger moves exclusively via RPCs and service-role
revoke insert, update, delete on public.wallet_transactions from anon, authenticated;
grant select on public.wallet_transactions to authenticated;

-- =============================================================================
-- 5. WALLETS RLS HARDENING
-- =============================================================================
alter table if exists public.wallets enable row level security;

-- Users can only view their own wallet balance
drop policy if exists "Wallets: owner select" on public.wallets;
create policy "Wallets: owner select"
  on public.wallets
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admins can audit all wallets
drop policy if exists "admins_read_wallets" on public.wallets;
create policy "admins_read_wallets"
  on public.wallets
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()));

-- Forbid direct client-side updates to balance
revoke insert, update, delete on public.wallets from anon, authenticated;
grant select on public.wallets to authenticated;

-- =============================================================================
-- 6. BRANDS RLS HARDENING
-- =============================================================================
alter table if exists public.brands enable row level security;

-- Public can read brands catalog
drop policy if exists "brands_select_all" on public.brands;
create policy "brands_select_all"
  on public.brands
  for select
  to anon, authenticated
  using (true);

-- Only verified admins can insert, update, or delete brands
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

-- =============================================================================
-- 7. COMPANY_LEDGER RLS HARDENING
-- =============================================================================
create table if not exists public.company_ledger (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  amount numeric not null check (amount > 0),
  description text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

alter table if exists public.company_ledger enable row level security;

-- Strictly restricted to authenticated admins
drop policy if exists "admins_manage_company_ledger" on public.company_ledger;
create policy "admins_manage_company_ledger"
  on public.company_ledger
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

revoke all on public.company_ledger from anon;
grant select, insert, update on public.company_ledger to authenticated;

-- =============================================================================
-- 8. CORPORATE_INQUIRIES RLS HARDENING
-- =============================================================================
alter table if exists public.corporate_inquiries enable row level security;

-- Anyone can submit an inquiry
drop policy if exists "anon_insert_inquiries" on public.corporate_inquiries;
create policy "anon_insert_inquiries"
  on public.corporate_inquiries
  for insert
  to anon, authenticated
  with check (true);

-- Only admins can read and update inquiry status
drop policy if exists "admins_manage_inquiries" on public.corporate_inquiries;
create policy "admins_manage_inquiries"
  on public.corporate_inquiries
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));
