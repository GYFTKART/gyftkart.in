-- Migration: Customer Manual Contact Verification & Timestamps
-- Adds email_verified, phone_verified, email_verified_at, phone_verified_at, email_confirmed_at, phone_confirmed_at, is_blocked, updated_at columns
-- and provides admin RPC functions (admin_verify_customer and admin_verify_customer_contacts) for single and bulk contact verification.

-- 1. Ensure verification and tracking columns exist on public.profiles
alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists phone_confirmed_at timestamptz,
  add column if not exists is_blocked boolean not null default false,
  add column if not exists updated_at timestamptz default now();

create index if not exists profiles_email_verified_idx on public.profiles(email_verified);
create index if not exists profiles_phone_verified_idx on public.profiles(phone_verified);
create index if not exists profiles_email_confirmed_at_idx on public.profiles(email_confirmed_at);

-- 2. Create security definer function for single admin customer verification (target_user_id, verify_type, is_verified)
drop function if exists public.admin_verify_customer(uuid, text, boolean);
create or replace function public.admin_verify_customer(
  target_user_id uuid,
  verify_type text, -- 'email' or 'phone'
  is_verified boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if verify_type = 'email' then
    update public.profiles
    set 
      email_verified = is_verified,
      email_verified_at = case when is_verified then now() else null end,
      email_confirmed_at = case when is_verified then coalesce(email_confirmed_at, now()) else null end,
      updated_at = now()
    where id = target_user_id;

    -- If unverified, clear auth confirmation
    if not is_verified then
      begin
        update auth.users
        set email_confirmed_at = null
        where id = target_user_id;
      exception when others then
        null;
      end;
    else
      begin
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = target_user_id;
      exception when others then
        null;
      end;
    end if;

  elsif verify_type = 'phone' then
    update public.profiles
    set 
      phone_verified = is_verified,
      phone_verified_at = case when is_verified then now() else null end,
      phone_confirmed_at = case when is_verified then coalesce(phone_confirmed_at, now()) else null end,
      updated_at = now()
    where id = target_user_id;

    if not is_verified then
      begin
        update auth.users
        set phone_confirmed_at = null
        where id = target_user_id;
      exception when others then
        null;
      end;
    else
      begin
        update auth.users
        set phone_confirmed_at = coalesce(phone_confirmed_at, now())
        where id = target_user_id;
      exception when others then
        null;
      end;
    end if;
  else
    raise exception 'Invalid verify_type: %. Must be "email" or "phone"', verify_type;
  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'type', verify_type,
    'verified', is_verified
  );
end;
$$;

grant execute on function public.admin_verify_customer(uuid, text, boolean) to authenticated;
grant execute on function public.admin_verify_customer(uuid, text, boolean) to anon;
grant execute on function public.admin_verify_customer(uuid, text, boolean) to service_role;

-- 3. Batch RPC helper for multiple customer IDs
create or replace function public.admin_verify_customer_contacts(
  target_user_ids uuid[],
  verify_email boolean default false,
  verify_phone boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  if verify_email and verify_phone then
    update public.profiles
    set email_verified = true,
        email_verified_at = coalesce(email_verified_at, v_now),
        email_confirmed_at = coalesce(email_confirmed_at, v_now),
        phone_verified = true,
        phone_verified_at = coalesce(phone_verified_at, v_now),
        phone_confirmed_at = coalesce(phone_confirmed_at, v_now),
        updated_at = v_now
    where id = any(target_user_ids);
  elsif verify_email then
    update public.profiles
    set email_verified = true,
        email_verified_at = coalesce(email_verified_at, v_now),
        email_confirmed_at = coalesce(email_confirmed_at, v_now),
        updated_at = v_now
    where id = any(target_user_ids);
  elsif verify_phone then
    update public.profiles
    set phone_verified = true,
        phone_verified_at = coalesce(phone_verified_at, v_now),
        phone_confirmed_at = coalesce(phone_confirmed_at, v_now),
        updated_at = v_now
    where id = any(target_user_ids);
  end if;

  get diagnostics v_count = row_count;

  -- Also update auth.users metadata where possible
  begin
    if verify_email then
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, v_now)
      where id = any(target_user_ids) and email_confirmed_at is null;
    end if;
    if verify_phone then
      update auth.users
      set phone_confirmed_at = coalesce(phone_confirmed_at, v_now)
      where id = any(target_user_ids) and phone_confirmed_at is null;
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'updated_count', coalesce(v_count, array_length(target_user_ids, 1))
  );
end;
$$;

grant execute on function public.admin_verify_customer_contacts(uuid[], boolean, boolean) to authenticated;
grant execute on function public.admin_verify_customer_contacts(uuid[], boolean, boolean) to anon;
grant execute on function public.admin_verify_customer_contacts(uuid[], boolean, boolean) to service_role;
