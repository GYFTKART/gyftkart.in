-- 20261019030000_order_lifecycle_utr_submission_cleanup.sql
--
-- 1. Ensure public.orders has alias columns: amount, utr, session_id, brand_name
-- 2. Ensure public.upi_payment_sessions has alias columns: utr, submitted_at
-- 3. Sync existing data between total_amount <-> amount, upi_utr <-> utr, upi_payment_id <-> session_id
-- 4. Enable authenticated client insert & update policies on public.orders for customer order creation on UTR submit
-- 5. Enable authenticated client update policy on public.upi_payment_sessions for UTR submit
-- 6. Add triggers to keep alias columns in lockstep
-- 7. Update submit_upi_payment_proof RPC to write to all order and session columns

-- Step 1: Add alias columns to public.orders
alter table public.orders
  add column if not exists amount numeric,
  add column if not exists utr text,
  add column if not exists session_id text,
  add column if not exists brand_name text;

-- Step 2: Add alias columns to public.upi_payment_sessions
alter table public.upi_payment_sessions
  add column if not exists utr text,
  add column if not exists submitted_at timestamptz;

-- Step 3: Backfill and keep in sync
update public.orders
   set amount = coalesce(amount, total_amount),
       total_amount = coalesce(total_amount, amount),
       utr = coalesce(utr, upi_utr),
       upi_utr = coalesce(upi_utr, utr),
       session_id = coalesce(session_id, upi_payment_id),
       upi_payment_id = coalesce(upi_payment_id, session_id);

update public.upi_payment_sessions
   set utr = coalesce(utr, customer_utr),
       customer_utr = coalesce(customer_utr, utr),
       submitted_at = coalesce(submitted_at, created_at);

-- Step 4: Ensure orders RLS policies allow authenticated customers to insert and update their own orders
drop policy if exists "orders_owner_insert" on public.orders;
create policy "orders_owner_insert"
  on public.orders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "orders_owner_update" on public.orders;
create policy "orders_owner_update"
  on public.orders
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Step 5: Ensure upi_payment_sessions RLS policies allow authenticated customers to submit UTR proof
drop policy if exists "upi_sessions_owner_update" on public.upi_payment_sessions;
create policy "upi_sessions_owner_update"
  on public.upi_payment_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Step 6: Sync trigger on public.orders so amount and total_amount, utr and upi_utr, session_id and upi_payment_id stay synced
create or replace function public.trg_sync_orders_columns()
returns trigger
language plpgsql
as $$
begin
  if new.amount is not null and new.total_amount is null then
    new.total_amount := new.amount;
  elsif new.total_amount is not null and new.amount is null then
    new.amount := new.total_amount;
  end if;

  if new.utr is not null and new.upi_utr is null then
    new.upi_utr := new.utr;
  elsif new.upi_utr is not null and new.utr is null then
    new.utr := new.upi_utr;
  end if;

  if new.session_id is not null and new.upi_payment_id is null then
    new.upi_payment_id := new.session_id;
  elsif new.upi_payment_id is not null and new.session_id is null then
    new.session_id := new.upi_payment_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_orders_columns_trigger on public.orders;
create trigger sync_orders_columns_trigger
before insert or update on public.orders
for each row
execute function public.trg_sync_orders_columns();

-- Trigger for upi_payment_sessions to keep utr and customer_utr synced
create or replace function public.trg_sync_upi_sessions_columns()
returns trigger
language plpgsql
as $$
begin
  if new.utr is not null and new.customer_utr is null then
    new.customer_utr := new.utr;
  elsif new.customer_utr is not null and new.utr is null then
    new.utr := new.customer_utr;
  end if;

  if new.submitted_at is null and new.status = 'PENDING_VERIFICATION' then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_upi_sessions_columns_trigger on public.upi_payment_sessions;
create trigger sync_upi_sessions_columns_trigger
before insert or update on public.upi_payment_sessions
for each row
execute function public.trg_sync_upi_sessions_columns();

-- Step 7: Atomic RPC update for submit_upi_payment_proof
create or replace function public.submit_upi_payment_proof(
  p_payment_id uuid,
  p_utr text,
  p_proof_path text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_uid uuid;
  v_session record;
  v_clean_utr text;
  v_existing_dup uuid;
  v_order_id uuid;
  v_brand_name text;
  v_order_amount numeric;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  v_clean_utr := trim(p_utr);
  if v_clean_utr !~ '^[0-9]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'UTR must be exactly 12 digits');
  end if;

  select * into v_session
    from public.upi_payment_sessions
   where id = p_payment_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_FOUND');
  end if;

  if v_session.user_id != v_uid then
    return jsonb_build_object('ok', false, 'error', 'OWNERSHIP_MISMATCH');
  end if;

  if v_session.status in ('SUCCESS', 'CONFIRMED', 'REJECTED', 'REVERTED', 'EXPIRED', 'CANCELLED') then
    return jsonb_build_object('ok', false, 'error', 'SESSION_' || v_session.status);
  end if;

  -- Guard against replay of same UTR across different payment sessions
  select id into v_existing_dup
    from public.upi_payment_sessions
   where (customer_utr = v_clean_utr or utr = v_clean_utr)
     and id != p_payment_id
   limit 1;

  if v_existing_dup is not null then
    return jsonb_build_object('ok', false, 'error', 'This UTR is already reported on another payment');
  end if;

  -- Update upi_payment_sessions to PENDING_VERIFICATION
  update public.upi_payment_sessions
     set customer_utr = v_clean_utr,
         utr = v_clean_utr,
         proof_path = coalesce(p_proof_path, proof_path),
         status = 'PENDING_VERIFICATION',
         submitted_at = now()
   where id = p_payment_id;

  -- For voucher checkouts (non-TOPUP), insert or update pending order in public.orders
  if coalesce(v_session.category, 'VOUCHER') != 'TOPUP' then
    v_order_amount := (v_session.amount_paise / 100.0);
    begin
      v_brand_name := coalesce((v_session.items->0->>'brand_name'), (v_session.items->0->>'name'), 'Gift Card');
    exception when others then
      v_brand_name := 'Gift Card';
    end;

    select id into v_order_id
      from public.orders
     where upi_payment_id = p_payment_id::text
        or session_id = p_payment_id::text
        or upi_order_id = v_session.order_id
     limit 1;

    if v_order_id is not null then
      update public.orders
         set status = 'PENDING_VERIFICATION',
             upi_utr = v_clean_utr,
             utr = v_clean_utr,
             amount = v_order_amount,
             total_amount = v_order_amount
       where id = v_order_id;
    else
      insert into public.orders (
        user_id,
        total_amount,
        amount,
        status,
        upi_order_id,
        upi_payment_id,
        session_id,
        upi_utr,
        utr,
        brand_name,
        items,
        created_at
      ) values (
        v_session.user_id,
        v_order_amount,
        v_order_amount,
        'PENDING_VERIFICATION',
        v_session.order_id,
        p_payment_id::text,
        p_payment_id::text,
        v_clean_utr,
        v_clean_utr,
        v_brand_name,
        v_session.items,
        now()
      )
      returning id into v_order_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'order_id', v_session.order_id,
    'status', 'PENDING_VERIFICATION'
  );
end;
$$;
