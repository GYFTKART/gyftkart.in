-- YouPI-PG payment columns for `orders`.
-- Mirrors the razorpay_order_id / razorpay_payment_id pair so both
-- gateways can coexist on the same orders table; nullable because a
-- Razorpay order leaves them NULL and vice versa. youpi_utr stores the
-- 12-digit bank reference the gateway reports (webhook `utr` field).

alter table public.orders
  add column if not exists youpi_order_id text,
  add column if not exists youpi_payment_id text,
  add column if not exists youpi_utr text;

-- Fast idempotency lookup for verify-youpi-payment (payment retry /
-- duplicate confirm must return the existing row, never double-issue).
create index if not exists orders_youpi_payment_id_idx
  on public.orders (youpi_payment_id)
  where youpi_payment_id is not null;
