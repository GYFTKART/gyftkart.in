-- Migration: Customer Management - Block / Suspend and Verification Columns
-- Adds is_blocked and phone_verified columns to profiles table
-- and provides atomic RPC for admin block/unblock toggling

alter table public.profiles
  add column if not exists is_blocked boolean not null default false,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists email_confirmed_at timestamptz;

create index if not exists profiles_is_blocked_idx on public.profiles(is_blocked);

-- Backfill email_confirmed_at & phone_verified from auth.users where possible
do $$
begin
  update public.profiles p
  set 
    email_confirmed_at = coalesce(p.email_confirmed_at, u.email_confirmed_at),
    phone_verified = coalesce(p.phone_verified, (u.phone_confirmed_at is not null))
  from auth.users u
  where p.id = u.id;
exception when others then
  null;
end $$;

-- RPC for admin to toggle customer block state
create or replace function public.admin_toggle_customer_block(
  target_user_id uuid,
  new_blocked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not exists (select 1 from public.admins where admins.id = auth.uid()) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  update public.profiles
  set is_blocked = new_blocked
  where id = target_user_id
  returning email into v_email;

  begin
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_blocked', new_blocked)
    where id = target_user_id;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'is_blocked', new_blocked,
    'email', v_email
  );
end;
$$;

grant execute on function public.admin_toggle_customer_block(uuid, boolean) to authenticated;
