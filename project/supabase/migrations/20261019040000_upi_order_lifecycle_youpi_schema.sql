-- 20261019040000_upi_order_lifecycle_youpi_schema.sql
--
-- UPI Order Creation Lifecycle using verified public.orders schema:
--   id (uuid)
--   user_id (uuid)
--   total_amount (numeric)
--   status (text)
--   razorpay_order_id (text)
--   razorpay_payment_id (text)
--   items (jsonb)
--   created_at (timestamptz)
--   youpi_order_id (text)
--   youpi_payment_id (text)
--   youpi_utr (text)

-- 1. Ensure RLS policies on public.orders for customer order creation on UTR submit
alter table if exists public.orders enable row level security;

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

-- 2. Drop any legacy triggers or functions that referenced non-existent columns
drop trigger if exists sync_orders_columns_trigger on public.orders;
drop function if exists public.trg_sync_orders_columns();

-- 3. Atomic RPC: submit_upi_payment_proof matching verified schema
create or replace function public.submit_upi_payment_proof(
  p_payment_id uuid,
  p_utr text,
  p_proof_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session record;
  v_clean_utr text;
  v_existing_dup uuid;
  v_order_id uuid;
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
   where customer_utr = v_clean_utr
     and id != p_payment_id
   limit 1;

  if v_existing_dup is not null then
    return jsonb_build_object('ok', false, 'error', 'This UTR is already reported on another payment');
  end if;

  -- Update upi_payment_sessions to PENDING_VERIFICATION
  update public.upi_payment_sessions
     set customer_utr = v_clean_utr,
         proof_path = coalesce(p_proof_path, proof_path),
         status = 'PENDING_VERIFICATION'
   where id = p_payment_id;

  -- For voucher checkouts (non-TOPUP), insert or update pending order in public.orders using exact schema
  if coalesce(v_session.category, 'VOUCHER') != 'TOPUP' then
    v_order_amount := (v_session.amount_paise / 100.0);

    select id into v_order_id
      from public.orders
     where youpi_payment_id = p_payment_id::text
        or youpi_order_id = v_session.order_id
     limit 1;

    if v_order_id is not null then
      update public.orders
         set status = 'PENDING_VERIFICATION',
             youpi_utr = v_clean_utr,
             total_amount = v_order_amount
       where id = v_order_id;
    else
      insert into public.orders (
        user_id,
        total_amount,
        status,
        youpi_order_id,
        youpi_payment_id,
        youpi_utr,
        items
      ) values (
        v_session.user_id,
        v_order_amount,
        'PENDING_VERIFICATION',
        v_session.order_id,
        p_payment_id::text,
        v_clean_utr,
        v_session.items
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

grant execute on function public.submit_upi_payment_proof(uuid, text, text) to authenticated, service_role;
