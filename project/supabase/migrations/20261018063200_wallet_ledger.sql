-- Wallet ledger (PBS-10 M1): wallets + wallet_transactions, SECURITY
-- DEFINER move-money RPCs, and the upi_payment_sessions.category tag
-- so admins/checkout can tell voucher payments from wallet top-ups.
-- Amounts are BIGINT PAISE everywhere (consistent with the system;
-- deliberate deviation from the spec's 'numeric').
-- Idempotent-ish: IF NOT EXISTS / DROP-then-CREATE patterns, safe to
-- re-apply like 20261018051000_upi_direct_rejected_status.sql.

-- ---------------------------------------------------------------------------
-- 1) wallets — one row per user; balance can never go negative
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  monthly_added_amount bigint not null default 0 check (monthly_added_amount >= 0),
  last_reset_month date not null default (date_trunc('month', now()))::date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) wallet_transactions — append-only ledger of every balance move
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('CREDIT', 'DEBIT')),
  category text not null check (category in ('TOPUP', 'VOUCHER_PURCHASE', 'REFUND')),
  amount bigint not null check (amount > 0),
  balance_after bigint not null,
  reference_id text,
  order_id text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) RLS: users read ONLY their own wallet/ledger; no user-side writes —
--    balances move exclusively through the SECURITY DEFINER RPCs below
--    (and service-role). Re-assert grants (push-trap lesson).
-- ---------------------------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "Wallets: owner select" on public.wallets;
create policy "Wallets: owner select"
  on public.wallets for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Wallet tx: owner select" on public.wallet_transactions;
create policy "Wallet tx: owner select"
  on public.wallet_transactions for select
  to authenticated
  using (user_id = auth.uid());

-- service_role bypasses RLS but keep explicit CRUD grants anyway
grant select, insert, update, delete on public.wallets to service_role;
grant select, insert, update, delete on public.wallet_transactions to service_role;
grant select on public.wallets to authenticated;
grant select on public.wallet_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 4a) ensure_wallet(p_user uuid default auth.uid())
--     Guarantees a wallet row exists and returns it. Callers may only
--     address THEIR OWN wallet (p_user = auth.uid()); the service role
--     (auth.uid() is null) may pass any user explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_wallet(p_user uuid default auth.uid())
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
begin
  p_user := coalesce(p_user, auth.uid());
  if p_user is null then
    raise exception 'ensure_wallet: user required';
  end if;
  if auth.uid() is not null and p_user is distinct from auth.uid() then
    raise exception 'ensure_wallet: only your own wallet';
  end if;
  insert into public.wallets (user_id) values (p_user)
    on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_user for update;
  return w;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b) wallet_credit(p_user, p_amount, p_reference, p_order default null)
--     Atomic TOPUP credit: row-lock, monthly-rollover, ₹10,000/month
--     (10000000 paise) top-up cap, balance + ledger row in ONE
--     transaction. Returns the new balance_after. Raises localized
--     messages ('Monthly cap exceeded') surfaced by callers.
-- ---------------------------------------------------------------------------
create or replace function public.wallet_credit(
  p_user uuid,
  p_amount bigint,
  p_reference text,
  p_order text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  v_month date;
begin
  if p_user is null then
    raise exception 'wallet_credit: user required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit amount';
  end if;

  select * into w from public.wallets where user_id = p_user for update;
  if not found then
    insert into public.wallets (user_id) values (p_user)
      on conflict (user_id) do nothing;
    select * into w from public.wallets where user_id = p_user for update;
  end if;

  v_month := (date_trunc('month', now()))::date;
  if w.last_reset_month is distinct from v_month then
    w.monthly_added_amount := 0;
    w.last_reset_month := v_month;
  end if;

  -- ₹0 to ₹10,000 worth of top-ups per calendar month
  if w.monthly_added_amount + p_amount > 10000000 then
    raise exception 'Monthly cap exceeded';
  end if;

  w.balance := w.balance + p_amount;
  w.monthly_added_amount := w.monthly_added_amount + p_amount;
  w.updated_at := now();

  update public.wallets set
    balance = w.balance,
    monthly_added_amount = w.monthly_added_amount,
    last_reset_month = w.last_reset_month,
    updated_at = w.updated_at
  where user_id = w.user_id;

  insert into public.wallet_transactions
    (wallet_id, user_id, type, category, amount, balance_after, reference_id, order_id)
  values
    (w.id, w.user_id, 'CREDIT', 'TOPUP', p_amount, w.balance, p_reference, p_order);

  return w.balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4c) wallet_debit(p_user, p_amount, p_category, p_order, p_reference)
--     Atomic DEBIT for voucher purchases / refunds; raises
--     'Insufficient balance' over-spend guard. Returns balance_after.
-- ---------------------------------------------------------------------------
create or replace function public.wallet_debit(
  p_user uuid,
  p_amount bigint,
  p_category text,
  p_order text,
  p_reference text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
begin
  if p_user is null then
    raise exception 'wallet_debit: user required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid debit amount';
  end if;
  if p_category not in ('VOUCHER_PURCHASE', 'REFUND') then
    raise exception 'wallet_debit: category must be VOUCHER_PURCHASE or REFUND';
  end if;

  select * into w from public.wallets where user_id = p_user for update;
  if not found or w.balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  w.balance := w.balance - p_amount;
  w.updated_at := now();

  update public.wallets set
    balance = w.balance,
    updated_at = w.updated_at
  where user_id = w.user_id;

  insert into public.wallet_transactions
    (wallet_id, user_id, type, category, amount, balance_after, reference_id, order_id)
  values
    (w.id, w.user_id, 'DEBIT', p_category, p_amount, w.balance, p_reference, p_order);

  return w.balance;
end;
$$;

-- authenticated users may ensure their own wallet (M2 UI); service role
grant execute on function public.ensure_wallet(uuid) to authenticated;
grant execute on function public.ensure_wallet(uuid) to service_role;
grant execute on function public.wallet_credit(uuid, bigint, text, text) to service_role;
grant execute on function public.wallet_debit(uuid, bigint, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5) upi_payment_sessions.category — admin/context tagging; default keeps
--    every existing row a VOUCHER session (safe, additive)
-- ---------------------------------------------------------------------------
alter table public.upi_payment_sessions
  add column if not exists category text not null default 'VOUCHER'
    check (category in ('VOUCHER', 'TOPUP'));
