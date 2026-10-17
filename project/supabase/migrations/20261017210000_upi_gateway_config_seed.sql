-- 20261017210000_upi_gateway_config_seed.sql
--
-- Idempotent merchant configuration for UPI Direct. Applied by
-- `supabase db push` along with the other UPI Direct migrations (and
-- safe to re-run: the singleton row is simply updated).
--
create table if not exists public.upi_gateway_config (
  id boolean primary key default true check (id = true),
  vpa text not null,
  payee_name text not null,
  observer_secret text,
  updated_at timestamptz not null default now()
);

alter table public.upi_gateway_config enable row level security;

insert into public.upi_gateway_config (id, vpa, payee_name)
values (true, '9450257575@superyes', 'Mohd Saad')
on conflict (id) do update
  set vpa = excluded.vpa,
      payee_name = excluded.payee_name,
      updated_at = now();
