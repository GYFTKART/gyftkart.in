-- 20261017210000_upi_direct_grants.sql
--
-- The db push/CLI migration path does not apply Supabase's usual
-- default-privilege grants on freshly created tables, so the platform
-- service_role lacked SELECT on the UPI Direct tables (seen live as
-- HTTP 403 -> permission denied 42501 -> function 503). Idempotently
-- grant the roles the implemented flow needs.
--
grant select, insert, update on table public.upi_gateway_config to service_role;
grant select, insert, update, delete on table public.upi_payment_sessions to service_role;
grant select on table public.upi_payment_sessions to authenticated;
grant select, insert, update, delete on table public.upi_observer_tokens to service_role;

-- Future UPI Direct tables created via CLI migrations inherit sane
-- defaults instead of breaking the same way again.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
