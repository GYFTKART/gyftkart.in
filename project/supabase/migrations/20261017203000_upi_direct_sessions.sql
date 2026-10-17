-- 20261017203000_upi_direct_sessions.sql
--
-- Supabase-native direct-UPINg payment sessions ("UPI Direct").
-- Replaces the YouPI-PG merchant/session/queue/SQLite stack with two
-- tables — the minimal state necessary for a verified direct-UPPI flow:
--
--   upi_gateway_config : singleton merchant VPA config (service-role only)
--   upi_payment_sessions : per-payment lifecycle (INITIATED -> ACTIVE ->
--       SUCCESS | FAILED | EXPIRED | CANCELLED)
--
-- Security:
--   * RLS enabled, NO policies on both tables — anon/authenticated get
--     nothing; only the Edge Functions' service-role key reads/writes.
--   * bank_ref (UTR) is unique when present — the hard guarantee that a
--     single bank credit alert can confirm exactly one payment ever.
--   * exact paise amounts stored per session; verification requires an
--     exact match (no cents rounding drift).
--
-- APPLY:
--   supabase db push  (or run in SQL editor)

create table if not exists public.upi_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_id text not null unique,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'INITIATED'
      check (status in ('INITIATED','ACTIVE','SUCCESS','FAILED','EXPIRED','CANCELLED')),
  items jsonb not null default '[]'::jsonb,
  buyer jsonb,
  bank_ref text,
  verification_level text check (verification_level in ('GMAIL','MANUAL')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists idx_upi_sessions_open
  on public.upi_payment_sessions (status, expires_at)
  where status = 'ACTIVE';

create unique index if not exists uq_upi_sessions_bank_ref
  on public.upi_payment_sessions (bank_ref)
  where bank_ref is not null;

-- No anon/authenticated policies: service-role (Edge Functions) only.
alter table public.upi_payment_sessions enable row level security;

create table if not exists public.upi_gateway_config (
  id boolean primary key default true check (id = true),
  vpa text not null,
  payee_name text not null,
  observer_secret text,
  updated_at timestamptz not null default now()
);

alter table public.upi_gateway_config enable row level security;
