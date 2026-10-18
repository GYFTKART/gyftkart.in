-- Migration: B2B Customer Management Schema & RPCs
-- 1. Schema extension for B2B Customers on profiles
alter table public.profiles
  add column if not exists customer_type text not null default 'B2C' check (customer_type in ('B2C', 'B2B')),
  add column if not exists company_name text,
  add column if not exists brand_trade_name text,
  add column if not exists gstin text,
  add column if not exists pan text,
  add column if not exists billing_address text,
  add column if not exists billing_state text,
  add column if not exists billing_city text,
  add column if not exists billing_pincode text,
  add column if not exists contact_person_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists credit_limit numeric not null default 0,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));

create index if not exists profiles_customer_type_idx on public.profiles(customer_type);
create index if not exists profiles_gstin_idx on public.profiles(gstin) where gstin is not null;

-- 2. Admin RLS policy on profiles
drop policy if exists "admins_manage_profiles" on public.profiles;
create policy "admins_manage_profiles"
  on public.profiles
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

-- 3. Update handle_new_user trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    phone,
    email,
    customer_type,
    company_name,
    brand_trade_name,
    gstin,
    pan,
    billing_address,
    billing_state,
    billing_city,
    billing_pincode,
    contact_person_name,
    contact_email,
    contact_phone,
    credit_limit,
    status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'customer_type', 'B2C'),
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'brand_trade_name',
    new.raw_user_meta_data->>'gstin',
    new.raw_user_meta_data->>'pan',
    new.raw_user_meta_data->>'billing_address',
    new.raw_user_meta_data->>'billing_state',
    new.raw_user_meta_data->>'billing_city',
    new.raw_user_meta_data->>'billing_pincode',
    new.raw_user_meta_data->>'contact_person_name',
    new.raw_user_meta_data->>'contact_email',
    new.raw_user_meta_data->>'contact_phone',
    coalesce((new.raw_user_meta_data->>'credit_limit')::numeric, 0),
    coalesce(new.raw_user_meta_data->>'status', 'active')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        email = excluded.email,
        customer_type = coalesce(excluded.customer_type, profiles.customer_type),
        company_name = coalesce(excluded.company_name, profiles.company_name),
        brand_trade_name = coalesce(excluded.brand_trade_name, profiles.brand_trade_name),
        gstin = coalesce(excluded.gstin, profiles.gstin),
        pan = coalesce(excluded.pan, profiles.pan),
        billing_address = coalesce(excluded.billing_address, profiles.billing_address),
        billing_state = coalesce(excluded.billing_state, profiles.billing_state),
        billing_city = coalesce(excluded.billing_city, profiles.billing_city),
        billing_pincode = coalesce(excluded.billing_pincode, profiles.billing_pincode),
        contact_person_name = coalesce(excluded.contact_person_name, profiles.contact_person_name),
        contact_email = coalesce(excluded.contact_email, profiles.contact_email),
        contact_phone = coalesce(excluded.contact_phone, profiles.contact_phone),
        credit_limit = coalesce(excluded.credit_limit, profiles.credit_limit),
        status = coalesce(excluded.status, profiles.status);
  return new;
end;
$$;

-- 4. RPC admin_create_b2b_customer
create or replace function public.admin_create_b2b_customer(
  p_email text,
  p_password text,
  p_company_name text,
  p_brand_trade_name text default null,
  p_gstin text default null,
  p_pan text default null,
  p_contact_person_name text default null,
  p_contact_phone text default null,
  p_billing_address text default null,
  p_billing_state text default null,
  p_billing_city text default null,
  p_billing_pincode text default null,
  p_credit_limit numeric default 0
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_encrypted_pw text;
begin
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'Admins only';
  end if;

  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'User with this email already exists';
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    phone,
    is_sso_user,
    is_anonymous
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', coalesce(p_company_name, p_contact_person_name, 'B2B Client'),
      'name', coalesce(p_company_name, p_contact_person_name, 'B2B Client'),
      'customer_type', 'B2B',
      'company_name', p_company_name,
      'brand_trade_name', p_brand_trade_name,
      'gstin', p_gstin,
      'pan', p_pan,
      'contact_person_name', p_contact_person_name,
      'contact_email', p_email,
      'contact_phone', p_contact_phone,
      'phone', p_contact_phone,
      'billing_address', p_billing_address,
      'billing_state', p_billing_state,
      'billing_city', p_billing_city,
      'billing_pincode', p_billing_pincode,
      'credit_limit', coalesce(p_credit_limit, 0),
      'status', 'active'
    ),
    now(),
    now(),
    p_contact_phone,
    false,
    false
  );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.profiles (
    id,
    full_name,
    email,
    phone,
    customer_type,
    company_name,
    brand_trade_name,
    gstin,
    pan,
    billing_address,
    billing_state,
    billing_city,
    billing_pincode,
    contact_person_name,
    contact_email,
    contact_phone,
    credit_limit,
    status
  )
  values (
    v_user_id,
    coalesce(p_company_name, p_contact_person_name, 'B2B Client'),
    p_email,
    p_contact_phone,
    'B2B',
    p_company_name,
    p_brand_trade_name,
    p_gstin,
    p_pan,
    p_billing_address,
    p_billing_state,
    p_billing_city,
    p_billing_pincode,
    p_contact_person_name,
    p_email,
    p_contact_phone,
    coalesce(p_credit_limit, 0),
    'active'
  )
  on conflict (id) do update set
    customer_type = 'B2B',
    company_name = excluded.company_name,
    brand_trade_name = excluded.brand_trade_name,
    gstin = excluded.gstin,
    pan = excluded.pan,
    billing_address = excluded.billing_address,
    billing_state = excluded.billing_state,
    billing_city = excluded.billing_city,
    billing_pincode = excluded.billing_pincode,
    contact_person_name = excluded.contact_person_name,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    credit_limit = excluded.credit_limit,
    status = excluded.status;

  insert into public.wallets (user_id, balance, monthly_added_amount)
  values (v_user_id, 0, 0)
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', p_email,
    'company_name', p_company_name
  );
end;
$$;

-- 5. RPC admin_update_b2b_customer
create or replace function public.admin_update_b2b_customer(
  p_customer_id uuid,
  p_company_name text,
  p_brand_trade_name text default null,
  p_gstin text default null,
  p_pan text default null,
  p_contact_person_name text default null,
  p_contact_phone text default null,
  p_billing_address text default null,
  p_billing_state text default null,
  p_billing_city text default null,
  p_billing_pincode text default null,
  p_credit_limit numeric default 0,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'Admins only';
  end if;

  update public.profiles
  set
    company_name = p_company_name,
    brand_trade_name = p_brand_trade_name,
    gstin = p_gstin,
    pan = p_pan,
    contact_person_name = p_contact_person_name,
    contact_phone = p_contact_phone,
    billing_address = p_billing_address,
    billing_state = p_billing_state,
    billing_city = p_billing_city,
    billing_pincode = p_billing_pincode,
    credit_limit = coalesce(p_credit_limit, 0),
    status = coalesce(p_status, 'active')
  where id = p_customer_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'company_name', p_company_name,
    'brand_trade_name', p_brand_trade_name,
    'gstin', p_gstin,
    'pan', p_pan,
    'contact_person_name', p_contact_person_name,
    'contact_phone', p_contact_phone,
    'billing_address', p_billing_address,
    'billing_state', p_billing_state,
    'billing_city', p_billing_city,
    'billing_pincode', p_billing_pincode,
    'credit_limit', coalesce(p_credit_limit, 0),
    'status', coalesce(p_status, 'active')
  )
  where id = p_customer_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 6. RPC admin_adjust_customer_balance
create or replace function public.admin_adjust_customer_balance(
  p_customer_id uuid,
  p_amount_paise bigint,
  p_type text,
  p_category text default 'ADJUSTMENT',
  p_remark text default 'Admin balance adjustment'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_current_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
begin
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'Admins only';
  end if;

  if p_type not in ('CREDIT', 'DEBIT') then
    raise exception 'Invalid transaction type: %', p_type;
  end if;

  if p_amount_paise <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.wallets (user_id, balance, monthly_added_amount)
  values (p_customer_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance into v_current_balance
  from public.wallets
  where user_id = p_customer_id
  for update;

  if p_type = 'CREDIT' then
    v_new_balance := v_current_balance + p_amount_paise;
  else
    if v_current_balance < p_amount_paise then
      raise exception 'Insufficient wallet balance for debit adjustment';
    end if;
    v_new_balance := v_current_balance - p_amount_paise;
  end if;

  update public.wallets
  set balance = v_new_balance,
      updated_at = now()
  where user_id = p_customer_id;

  v_tx_id := gen_random_uuid();
  insert into public.wallet_transactions (
    id,
    user_id,
    amount,
    type,
    category,
    reference_id,
    remark,
    created_at,
    completed_at
  )
  values (
    v_tx_id,
    p_customer_id,
    p_amount_paise,
    p_type,
    coalesce(p_category, 'ADJUSTMENT'),
    'ADJ-' || upper(substr(v_tx_id::text, 1, 8)),
    p_remark,
    now(),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx_id,
    'previous_balance_paise', v_current_balance,
    'new_balance_paise', v_new_balance
  );
end;
$$;
