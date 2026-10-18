-- 20261018183000_admin_read_ledger_policies.sql
--
-- Allow authenticated admins to read wallets, wallet_transactions, and orders for Customer Ledger reconciliation.

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'admins_read_wallets' and polrelid = 'public.wallets'::regclass) then
    create policy "admins_read_wallets" on public.wallets for select to authenticated
      using (exists (select 1 from public.admins a where a.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policy where polname = 'admins_read_wallet_transactions' and polrelid = 'public.wallet_transactions'::regclass) then
    create policy "admins_read_wallet_transactions" on public.wallet_transactions for select to authenticated
      using (exists (select 1 from public.admins a where a.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policy where polname = 'admins_read_orders' and polrelid = 'public.orders'::regclass) then
    create policy "admins_read_orders" on public.orders for select to authenticated
      using (exists (select 1 from public.admins a where a.id = auth.uid()));
  end if;
end $$;
