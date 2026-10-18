-- 20261018170000_upi_direct_revert_rollback.sql
--
-- Revert / Rollback flow for confirmed UPI Direct payment sessions (PBS-10).
-- 1) Widen upi_payment_sessions.status CHECK to include 'REVERTED'
-- 2) Widen wallet_transactions.category CHECK to include 'ADJUSTMENT', 'ROLLBACK'
-- 3) Atomic admin_revert_payment_session RPC function to rollback confirmed topups
--    and record compensating wallet_transactions ledger entries.

do $$
declare con_name text;
begin
  select con.conname
    into con_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'upi_payment_sessions'
     and con.contype = 'c'
     and con.conname like 'upi_payment_sessions_status%';
  if con_name is not null then
    execute format('alter table public.upi_payment_sessions drop constraint %I', con_name);
  end if;
end $$;

alter table public.upi_payment_sessions
  add constraint upi_payment_sessions_status_check
  check (status in ('INITIATED','ACTIVE','SUCCESS','FAILED','EXPIRED','CANCELLED','REJECTED','REVERTED'));

do $$
declare con_name text;
begin
  select con.conname
    into con_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'wallet_transactions'
     and con.contype = 'c'
     and con.conname like 'wallet_transactions_category%';
  if con_name is not null then
    execute format('alter table public.wallet_transactions drop constraint %I', con_name);
  end if;
end $$;

alter table public.wallet_transactions
  add constraint wallet_transactions_category_check
  check (category in ('TOPUP','VOUCHER_PURCHASE','REFUND','ADJUSTMENT','ROLLBACK'));

-- ---------------------------------------------------------------------------
-- Atomic RPC: admin_revert_payment_session(p_payment_id uuid, p_reason text)
-- ---------------------------------------------------------------------------
create or replace function public.admin_revert_payment_session(
  p_payment_id uuid,
  p_reason text default 'Approved in error / payment not credited'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.upi_payment_sessions%rowtype;
  w public.wallets%rowtype;
  v_new_balance bigint;
  v_remark text;
  v_clean_reason text;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required';
  end if;

  select * into s from public.upi_payment_sessions where id = p_payment_id for update;
  if not found then
    raise exception 'Payment session not found';
  end if;

  if s.status != 'SUCCESS' then
    raise exception 'Session is not confirmed (current status: %)', s.status;
  end if;

  v_clean_reason := coalesce(nullif(trim(p_reason), ''), 'Approved in error / payment not credited');
  v_remark := 'Reverted by Admin: ' || v_clean_reason;

  -- TOPUP session: deduct balance from customer wallet and insert ledger debit
  if s.category = 'TOPUP' then
    select * into w from public.wallets where user_id = s.user_id for update;
    if not found then
      raise exception 'Customer wallet not found for user %', s.user_id;
    end if;

    if w.balance < s.amount_paise then
      raise exception 'Insufficient balance: customer wallet has % paise, cannot revert % paise', w.balance, s.amount_paise;
    end if;

    w.balance := w.balance - s.amount_paise;
    w.monthly_added_amount := greatest(0, w.monthly_added_amount - s.amount_paise);
    w.updated_at := now();

    update public.wallets set
      balance = w.balance,
      monthly_added_amount = w.monthly_added_amount,
      updated_at = w.updated_at
    where user_id = w.user_id;

    -- Compensating debit ledger record
    insert into public.wallet_transactions
      (wallet_id, user_id, type, category, amount, balance_after, reference_id, order_id)
    values
      (w.id, w.user_id, 'DEBIT', 'ROLLBACK', s.amount_paise, w.balance, 'Reversal of top-up session ' || s.order_id, s.order_id);

    v_new_balance := w.balance;
  end if;

  -- Update session status
  update public.upi_payment_sessions set
    status = 'REVERTED',
    admin_remark = case
      when admin_remark is null or admin_remark = '' then v_remark
      else admin_remark || ' | ' || v_remark
    end,
    completed_at = now()
  where id = s.id;

  return json_build_object(
    'ok', true,
    'session_id', s.id,
    'order_id', s.order_id,
    'status', 'REVERTED',
    'amount_paise', s.amount_paise,
    'balance_after', v_new_balance
  )::jsonb;
end;
$$;

grant execute on function public.admin_revert_payment_session(uuid, text) to authenticated;
grant execute on function public.admin_revert_payment_session(uuid, text) to service_role;
