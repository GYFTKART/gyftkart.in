-- Migration: 20261019120000_cancel_upi_draft_session.sql
-- Enables clean cancellation and deletion of unsubmitted draft UPI payment sessions
-- so no ghost sessions linger when a customer cancels or abandons QR payment.

-- 1. Policy allowing customers to delete their own unsubmitted draft sessions
DROP POLICY IF EXISTS "owner_delete_draft_session" ON public.upi_payment_sessions;
CREATE POLICY "owner_delete_draft_session"
  ON public.upi_payment_sessions
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (customer_utr IS NULL OR customer_utr = '' OR customer_utr = '-')
    AND status IN ('AWAITING_PAYMENT', 'ACTIVE', 'DRAFT', 'QR_GENERATED')
  );

-- 2. Atomic SECURITY DEFINER RPC to cancel/delete draft session
CREATE OR REPLACE FUNCTION public.cancel_upi_draft_session(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  DELETE FROM public.upi_payment_sessions
  WHERE id = p_payment_id
    AND user_id = auth.uid()
    AND (customer_utr IS NULL OR customer_utr = '' OR customer_utr = '-')
    AND status IN ('AWAITING_PAYMENT', 'ACTIVE', 'DRAFT', 'QR_GENERATED');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_upi_draft_session(UUID) TO authenticated;
