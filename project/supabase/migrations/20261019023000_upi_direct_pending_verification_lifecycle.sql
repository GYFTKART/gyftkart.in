-- 20261019023000_upi_direct_pending_verification_lifecycle.sql
--
-- 1. Extend upi_payment_sessions status check constraint to include:
--    'AWAITING_PAYMENT', 'QR_GENERATED', 'PENDING_VERIFICATION'
-- 2. Provide atomic submit_upi_payment_proof RPC to attach UTR + proof screenshot,
--    set status to 'PENDING_VERIFICATION', and insert an order into public.orders.

do $$
declare
  con_name text;
begin
  select con.conname into con_name
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
  check (status in (
    'INITIATED',
    'ACTIVE',
    'AWAITING_PAYMENT',
    'QR_GENERATED',
    'PENDING_VERIFICATION',
    'SUCCESS',
    'CONFIRMED',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
    'REJECTED',
    'REVERTED'
  ));

-- Create index for fast filtering of pending verification sessions with UTR
create index if not exists upi_sessions_pending_utr_idx
  on public.upi_payment_sessions (status, customer_utr)
  where customer_utr is not null;

-- ---------------------------------------------------------------------------
-- Atomic RPC: submit_upi_payment_proof
-- Called when buyer submits their 12-digit UTR and optional proof screenshot.
-- Transitions session to 'PENDING_VERIFICATION' and inserts the order row.
-- ---------------------------------------------------------------------------
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

  -- For voucher checkouts (non-TOPUP), insert or update pending order in public.orders
  if coalesce(v_session.category, 'VOUCHER') != 'TOPUP' then
    select id into v_order_id
      from public.orders
     where upi_payment_id = p_payment_id::text
        or upi_order_id = v_session.order_id
     limit 1;

    if v_order_id is not null then
      update public.orders
         set status = 'PENDING_VERIFICATION',
             upi_utr = v_clean_utr
       where id = v_order_id;
    else
      insert into public.orders (
        user_id,
        total_amount,
        status,
        upi_order_id,
        upi_payment_id,
        upi_utr,
        items
      ) values (
        v_session.user_id,
        (v_session.amount_paise / 100.0),
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
