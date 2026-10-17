-- 20261017195000_purchases_issued_payment_unique.sql
--
-- DB-level guarantee that a single paid gateway payment can never issue
-- gift cards twice. `purchases.issued_under_payment_id` records which
-- gateway payment produced each issuance batch; the partial unique index
-- makes any second batch for the same payment impossible at the storage
-- layer (e.g. duplicate success callbacks, double-tapped verify, races).
--
-- Older rows (issued before this migration, or manual/admin-issued
-- cards) keep NULL and are unaffected by the unique index.
--
-- APPLY:
--   supabase db push  (or run in SQL editor)

alter table public.purchases
  add column if not exists issued_under_payment_id text;

create index if not exists idx_purchases_issued_under_payment
  on public.purchases (issued_under_payment_id)
  where issued_under_payment_id is not null;

-- Idempotent issuance barrier: at most one purchases batch per gateway
-- payment id. Partial index (NULL-safe) — legacy rows pass through.
create unique index if not exists uq_purchases_one_batch_per_payment
  on public.purchases (issued_under_payment_id)
  where issued_under_payment_id is not null;
