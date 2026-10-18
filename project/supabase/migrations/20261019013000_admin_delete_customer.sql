-- Migration: Admin Delete Customer RPC
-- Deletes a customer profile and removes the user from auth.users
-- Handles cascading data cleanly

create or replace function public.admin_delete_customer(
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
begin
  -- 1. Check admin authorization
  if not exists (select 1 from public.admins where admins.id = auth.uid()) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  -- 2. Prevent deleting an admin account
  if exists (select 1 from public.admins where admins.id = target_user_id) then
    raise exception 'Cannot delete an administrator account';
  end if;

  -- 3. Capture customer info before deletion
  select email, full_name into v_email, v_name
  from public.profiles
  where id = target_user_id;

  -- 4. Clean up related customer records
  delete from public.cart_items where user_id = target_user_id;
  delete from public.wallet_transactions where user_id = target_user_id;
  delete from public.wallets where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  -- 5. Delete from auth.users (cascades any remaining auth records like identities/sessions)
  begin
    delete from auth.users where id = target_user_id;
  exception when others then
    -- Fallback to ban/soft-delete in case of strict auth constraints
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_deleted', true, 'is_blocked', true),
        banned_until = '3000-01-01 00:00:00+00'::timestamptz
    where id = target_user_id;
  end;

  return jsonb_build_object(
    'success', true,
    'deleted_user_id', target_user_id,
    'email', v_email,
    'full_name', v_name
  );
end;
$$;

grant execute on function public.admin_delete_customer(uuid) to authenticated;
