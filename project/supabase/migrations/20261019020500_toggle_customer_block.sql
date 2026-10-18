-- Migration: Toggle Customer Block RPC & Profiles Block Columns
-- Adds is_blocked, blocked_at, block_reason columns to profiles
-- and implements toggle_customer_block RPC with admin/service grants

-- 1. Add block status and reason columns to profiles if they do not exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS block_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create the toggle_customer_block RPC function
CREATE OR REPLACE FUNCTION public.toggle_customer_block(
  target_user_id UUID,
  should_block BOOLEAN,
  reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update profiles table
  UPDATE public.profiles
  SET 
    is_blocked = should_block,
    status = CASE WHEN should_block THEN 'inactive' ELSE 'active' END,
    blocked_at = CASE WHEN should_block THEN NOW() ELSE NULL END,
    block_reason = CASE WHEN should_block THEN reason ELSE NULL END,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Optional: Update Supabase auth app_metadata to prevent login token refresh
  BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = 
      COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_blocked', should_block)
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true, 
    'user_id', target_user_id, 
    'is_blocked', should_block
  );
END;
$$;

-- 3. Also alias admin_toggle_customer_block for backwards compatibility
CREATE OR REPLACE FUNCTION public.admin_toggle_customer_block(
  target_user_id UUID,
  new_blocked BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.toggle_customer_block(target_user_id, new_blocked, NULL);
END;
$$;

-- Grant execution permission to authenticated service/admin roles
GRANT EXECUTE ON FUNCTION public.toggle_customer_block(UUID, BOOLEAN, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_customer_block(UUID, BOOLEAN) TO authenticated, service_role, anon;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
