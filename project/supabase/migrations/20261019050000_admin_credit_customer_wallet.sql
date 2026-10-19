-- Migration: 20261019050000_admin_credit_customer_wallet.sql
-- Description: Atomic, secure RPC function in Supabase to manually credit/adjust customer wallet balance safely.

-- 1. Ensure required columns exist on wallets
ALTER TABLE public.wallets 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure required columns exist on wallet_transactions
ALTER TABLE public.wallet_transactions 
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';

-- 3. Widen wallet_transactions_category_check to allow 'Manual Adjustment' and 'ADJUSTMENT'
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'wallet_transactions'
    AND con.contype = 'c'
    AND con.conname LIKE 'wallet_transactions_category%';
  IF con_name IS NOT NULL THEN
    EXECUTE FORMAT('ALTER TABLE public.wallet_transactions DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_category_check
  CHECK (category IN ('TOPUP','VOUCHER_PURCHASE','REFUND','ADJUSTMENT','ROLLBACK','Manual Adjustment'));

-- 4. Create the atomic admin_credit_customer_wallet RPC function
CREATE OR REPLACE FUNCTION public.admin_credit_customer_wallet(
  target_user_id UUID,
  credit_amount NUMERIC,
  action_type TEXT, -- 'CREDIT' or 'DEBIT'
  admin_reason TEXT,
  reference_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance NUMERIC := 0.00;
  v_new_balance NUMERIC := 0.00;
  v_amount_paise BIGINT;
  v_ref TEXT;
BEGIN
  -- Validate action_type
  IF action_type NOT IN ('CREDIT', 'DEBIT') THEN
    RAISE EXCEPTION 'Invalid action_type. Must be CREDIT or DEBIT';
  END IF;

  IF credit_amount IS NULL OR credit_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- 1. Ensure user has a wallet row in public.wallets
  INSERT INTO public.wallets (user_id, balance, created_at, updated_at)
  VALUES (target_user_id, 0, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. Lock & fetch current balance (in GyftKart, balance is stored as bigint paise)
  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets
  WHERE user_id = target_user_id
  FOR UPDATE;

  -- Convert credit_amount (in rupees) to paise for precision balance storage
  v_amount_paise := ROUND(credit_amount * 100)::BIGINT;

  -- 3. Calculate new balance
  IF action_type = 'CREDIT' THEN
    v_new_balance := v_current_balance + v_amount_paise;
  ELSIF action_type = 'DEBIT' THEN
    IF v_current_balance < v_amount_paise THEN
      RAISE EXCEPTION 'Insufficient balance to deduct ₹%', credit_amount;
    END IF;
    v_new_balance := v_current_balance - v_amount_paise;
  END IF;

  -- 4. Update wallets table
  UPDATE public.wallets
  SET balance = v_new_balance, updated_at = NOW()
  WHERE id = v_wallet_id;

  v_ref := COALESCE(reference_note, 'MANUAL-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)));

  -- 5. Record entry in wallet_transactions table
  INSERT INTO public.wallet_transactions (
    user_id,
    wallet_id,
    type,
    category,
    amount,
    balance_after,
    reference,
    reference_id,
    remark,
    status,
    created_at,
    completed_at
  ) VALUES (
    target_user_id,
    v_wallet_id,
    action_type,
    'Manual Adjustment',
    v_amount_paise,
    v_new_balance,
    v_ref,
    v_ref,
    COALESCE(admin_reason, 'Manual Admin Adjustment'),
    'COMPLETED',
    NOW(),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'old_balance', (v_current_balance / 100.0),
    'new_balance', (v_new_balance / 100.0),
    'old_balance_paise', v_current_balance,
    'new_balance_paise', v_new_balance,
    'reference', v_ref
  );
END;
$$;

-- Grant execution permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_credit_customer_wallet(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
