-- 20261018174500_wallet_transactions_remark_completed.sql
-- Add remark and completed_at to wallet_transactions for audit and UI clarity

alter table public.wallet_transactions
  add column if not exists remark text,
  add column if not exists completed_at timestamptz default now();

-- Backfill completed_at from created_at where missing
update public.wallet_transactions
  set completed_at = created_at
where completed_at is null;

-- Backfill remark from reference_id where missing
update public.wallet_transactions
  set remark = reference_id
where remark is null and reference_id is not null;
