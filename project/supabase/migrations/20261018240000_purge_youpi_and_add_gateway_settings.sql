-- 20261018240000_purge_youpi_and_add_gateway_settings.sql
--
-- 1. Purge legacy YouPI columns from public.orders & migrate to upi_* columns
-- 2. Create public.payment_gateway_settings table with Razorpay disabled by default
-- 3. Expose public.get_public_payment_gateways() security definer RPC

-- Step 1: Ensure upi_* columns exist on public.orders
alter table if exists public.orders
  add column if not exists upi_order_id text,
  add column if not exists upi_payment_id text,
  add column if not exists upi_utr text;

-- Migrate existing values if legacy columns exist
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'youpi_order_id') then
    update public.orders
    set upi_order_id = coalesce(upi_order_id, youpi_order_id),
        upi_payment_id = coalesce(upi_payment_id, youpi_payment_id),
        upi_utr = coalesce(upi_utr, youpi_utr)
    where youpi_order_id is not null or youpi_payment_id is not null or youpi_utr is not null;

    alter table public.orders
      drop column if exists youpi_order_id cascade,
      drop column if exists youpi_payment_id cascade,
      drop column if exists youpi_utr cascade;
  end if;
end $$;

drop index if exists public.orders_youpi_payment_id_idx;

create index if not exists orders_upi_payment_id_idx
  on public.orders (upi_payment_id)
  where upi_payment_id is not null;

-- Step 2: Payment Gateway Settings Table
create table if not exists public.payment_gateway_settings (
  id text primary key default 'default',
  razorpay_enabled boolean not null default false,
  razorpay_key_id text not null default '',
  razorpay_key_secret text not null default '',
  razorpay_webhook_secret text not null default '',
  upi_direct_enabled boolean not null default true,
  wallet_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.payment_gateway_settings enable row level security;

-- Insert default row if not exists (Razorpay DISABLED by default)
insert into public.payment_gateway_settings (
  id,
  razorpay_enabled,
  razorpay_key_id,
  razorpay_key_secret,
  razorpay_webhook_secret,
  upi_direct_enabled,
  wallet_enabled
) values (
  'default',
  false,
  'rzp_live_TQ77emdbsixP9W',
  '',
  '',
  true,
  true
)
on conflict (id) do nothing;

-- Admins can view and update payment gateway settings
drop policy if exists "admins_manage_payment_settings" on public.payment_gateway_settings;
create policy "admins_manage_payment_settings"
  on public.payment_gateway_settings
  for all
  to authenticated
  using (exists (select 1 from public.admins a where a.id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.id = auth.uid()));

grant all on table public.payment_gateway_settings to service_role;

-- Step 3: Public Gateway Check RPC (No secrets exposed)
create or replace function public.get_public_payment_gateways()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'upi_direct_enabled', coalesce(s.upi_direct_enabled, true),
    'wallet_enabled', coalesce(s.wallet_enabled, true),
    'razorpay_enabled', coalesce(s.razorpay_enabled, false),
    'razorpay_key_id', case when coalesce(s.razorpay_enabled, false) = true then coalesce(s.razorpay_key_id, '') else '' end
  )
  from public.payment_gateway_settings s
  where s.id = 'default'
  limit 1;
$$;

grant execute on function public.get_public_payment_gateways() to anon, authenticated, service_role;
