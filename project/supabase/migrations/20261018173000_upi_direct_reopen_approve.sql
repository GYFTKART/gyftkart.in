-- 20261018173000_upi_direct_reopen_approve.sql
--
-- Re-approval / Re-open flow for accidentally rejected UPI Direct payment sessions.
-- 1) Widen upi_payment_sessions.status CHECK to include 'CONFIRMED'
-- 2) Atomic admin_reopen_payment_session RPC function to re-approve rejected sessions:
--    - For TOPUP: credits customer wallet balance and records ledger transaction.
--    - For VOUCHER: marks session CONFIRMED, ensures orders row, and issues gift cards.

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
  check (status in ('INITIATED','ACTIVE','SUCCESS','CONFIRMED','FAILED','EXPIRED','CANCELLED','REJECTED','REVERTED'));

-- ---------------------------------------------------------------------------
-- Atomic RPC: admin_reopen_payment_session(p_payment_id uuid, p_reason text)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reopen_payment_session(
  p_payment_id uuid,
  p_reason text default 'Approved after review'
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
  v_clean_reason text;
  v_code text;
  it jsonb;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required';
  end if;

  select * into s from public.upi_payment_sessions where id = p_payment_id for update;
  if not found then
    raise exception 'Payment session not found';
  end if;

  if s.status != 'REJECTED' then
    raise exception 'Session is not rejected (current status: %)', s.status;
  end if;

  v_clean_reason := coalesce(nullif(trim(p_reason), ''), 'Approved after review');

  -- TOPUP session: credit balance to customer wallet and insert ledger credit
  if s.category = 'TOPUP' then
    select * into w from public.wallets where user_id = s.user_id for update;
    if not found then
      insert into public.wallets (user_id) values (s.user_id)
        on conflict (user_id) do nothing;
      select * into w from public.wallets where user_id = s.user_id for update;
    end if;

    w.balance := coalesce(w.balance, 0) + s.amount_paise;
    w.monthly_added_amount := coalesce(w.monthly_added_amount, 0) + s.amount_paise;
    w.updated_at := now();

    update public.wallets set
      balance = w.balance,
      monthly_added_amount = w.monthly_added_amount,
      updated_at = w.updated_at
    where user_id = w.user_id;

    -- Positive credit ledger record
    insert into public.wallet_transactions
      (wallet_id, user_id, type, category, amount, balance_after, reference_id, order_id)
    values
      (w.id, w.user_id, 'CREDIT', 'TOPUP', s.amount_paise, w.balance, v_clean_reason || ': ' || s.order_id, s.order_id);

    v_new_balance := w.balance;
  else
    -- Voucher session: reconcile orders row and purchases rows
    if not exists (
      select 1 from public.orders 
      where youpi_payment_id = s.id::text 
         or razorpay_payment_id = s.id::text 
         or youpi_order_id = s.order_id
    ) then
      insert into public.orders (user_id, total_amount, status, youpi_order_id, youpi_payment_id, youpi_utr, items)
      values (
        s.user_id,
        (s.amount_paise::numeric / 100),
        'successful',
        s.order_id,
        s.id::text,
        coalesce(s.bank_ref, s.customer_utr),
        s.items
      );
    end if;

    -- Fulfill gift cards (purchases) if not already created
    if not exists (
      select 1 from public.purchases 
      where issued_under_payment_id = s.id::text 
         or session_id = s.order_id
    ) then
      if s.items is not null and jsonb_typeof(s.items) = 'array' then
        for it in select * from jsonb_array_elements(s.items)
        loop
          v_code := upper(
            substring(md5(random()::text) from 1 for 4) || '-' ||
            substring(md5(random()::text) from 5 for 4) || '-' ||
            substring(md5(random()::text) from 9 for 4) || '-' ||
            substring(md5(random()::text) from 13 for 4)
          );

          insert into public.purchases (
            session_id,
            user_id,
            brand_slug,
            brand_name,
            brand_color,
            brand_color2,
            amount,
            quantity,
            recipient_name,
            recipient_email,
            recipient_phone,
            message,
            occasion,
            gift_card_code,
            status,
            balance,
            issued_under_payment_id
          ) values (
            s.order_id,
            s.user_id,
            coalesce(it->>'brand_slug', it->>'slug', lower(regexp_replace(coalesce(it->>'brand_name', 'brand'), '\s+', '-', 'g'))),
            coalesce(it->>'brand_name', it->>'brand', it->>'name', 'Gift Card'),
            coalesce(it->>'brand_color', '#6b21a8'),
            coalesce(it->>'brand_color2', '#3b0764'),
            coalesce((it->>'amount')::numeric, (it->>'denomination')::numeric, (s.amount_paise::numeric / 100)),
            greatest(1, coalesce((it->>'quantity')::int, (it->>'qty')::int, 1)),
            coalesce(it->>'recipient_name', ''),
            coalesce(it->>'recipient_email', ''),
            coalesce(it->>'recipient_phone', ''),
            coalesce(it->>'message', ''),
            coalesce(it->>'occasion', ''),
            v_code,
            'active',
            coalesce((it->>'amount')::numeric, (it->>'denomination')::numeric, (s.amount_paise::numeric / 100)) * greatest(1, coalesce((it->>'quantity')::int, (it->>'qty')::int, 1)),
            s.id::text
          );
        end loop;
      end if;
    end if;
  end if;

  -- Update session status to CONFIRMED (fallback to SUCCESS if legacy constraint)
  begin
    update public.upi_payment_sessions set
      status = 'CONFIRMED',
      admin_remark = v_clean_reason,
      completed_at = now()
    where id = s.id;
  exception when check_violation then
    update public.upi_payment_sessions set
      status = 'SUCCESS',
      admin_remark = v_clean_reason,
      completed_at = now()
    where id = s.id;
  end;

  return json_build_object(
    'ok', true,
    'session_id', s.id,
    'order_id', s.order_id,
    'status', 'CONFIRMED',
    'amount_paise', s.amount_paise,
    'balance_after', v_new_balance
  )::jsonb;
end;
$$;

grant execute on function public.admin_reopen_payment_session(uuid, text) to authenticated;
grant execute on function public.admin_reopen_payment_session(uuid, text) to service_role;
