-- Wallet monthly top-up cap fix: the RPC shipped with the paise literal
-- 10_000_000 (₹1,00,000) while the product spec — and the UI copy — is
-- ₹10,000/month (1_000_000 paise). Server-side cap now matches the wallet
-- dashboard text ("cap ₹10,000/month"). Everything else in the function is
-- byte-identical to the M1 deployment.
CREATE OR REPLACE FUNCTION public.wallet_credit(
  p_user uuid,
  p_amount bigint,
  p_reference text,
  p_order text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  w public.wallets%rowtype;
  v_month date;
begin
  if p_user is null then
    raise exception 'wallet_credit: user required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit amount';
  end if;

  select * into w from public.wallets where user_id = p_user for update;
  if not found then
    insert into public.wallets (user_id) values (p_user)
      on conflict (user_id) do nothing;
    select * into w from public.wallets where user_id = p_user for update;
  end if;

  v_month := (date_trunc('month', now()))::date;
  if w.last_reset_month is distinct from v_month then
    w.monthly_added_amount := 0;
    w.last_reset_month := v_month;
  end if;

  -- ₹0 to ₹10,000 worth of top-ups per calendar month (1_000_000 paise)
  if w.monthly_added_amount + p_amount > 1000000 then
    raise exception 'Monthly cap exceeded';
  end if;

  w.balance := w.balance + p_amount;
  w.monthly_added_amount := w.monthly_added_amount + p_amount;
  w.updated_at := now();

  update public.wallets set
    balance = w.balance,
    monthly_added_amount = w.monthly_added_amount,
    last_reset_month = w.last_reset_month,
    updated_at = w.updated_at
  where user_id = w.user_id;

  insert into public.wallet_transactions
    (wallet_id, user_id, type, category, amount, balance_after, reference_id, order_id)
  values
    (w.id, w.user_id, 'CREDIT', 'TOPUP', p_amount, w.balance, p_reference, p_order);

  return w.balance;
end;
$function$;
