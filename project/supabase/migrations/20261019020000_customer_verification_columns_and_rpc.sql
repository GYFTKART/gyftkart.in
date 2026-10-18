-- Migration: Customer Manual Contact Verification & Timestamps
-- Adds email_confirmed_at, phone_confirmed_at, email_verified, phone_verified, is_blocked columns to public.profiles
-- and provides admin RPC for toggling/setting contact verification flags in bulk or single customer.

alter table public.profiles
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists phone_confirmed_at timestamptz,
  add column if not exists email_verified boolean not null default false,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists is_blocked boolean not null default false;

create index if not exists profiles_email_confirmed_at_idx on public.profiles(email_confirmed_at);
create index if not exists profiles_phone_verified_idx on public.profiles(phone_verified);

-- RPC for admin to manually verify contact info (email and/or phone) for single or multiple customers
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
  if not exists (select 1 from public.admins where admins.id = auth.uid()) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  if verify_email and verify_phone then
    update public.profiles
    set email_confirmed_at = coalesce(email_confirmed_at, v_now),
        email_verified = true,
        phone_confirmed_at = coalesce(phone_confirmed_at, v_now),
        phone_verified = true
    where id = any(target_user_ids);
  elsif verify_email then
    update public.profiles
    set email_confirmed_at = coalesce(email_confirmed_at, v_now),
        email_verified = true
    where id = any(target_user_ids);
  elsif verify_phone then
    update public.profiles
    set phone_confirmed_at = coalesce(phone_confirmed_at, v_now),
        phone_verified = true
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
