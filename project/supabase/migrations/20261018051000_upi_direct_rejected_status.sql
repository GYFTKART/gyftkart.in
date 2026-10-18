-- 20261018051000_upi_direct_rejected_status.sql
--
-- Admin rejections for UPI Direct sessions become their own terminal
-- status (REJECTED) with a mandatory admin remark, instead of being
-- lumped into CANCELLED. Evidence columns stay untouched.
--
--  1) widen the status CHECK to include 'REJECTED'
--     (drop/recreate the auto-named status constraint in this file;
--      located via pg_constraint in case its name differs)
--  2) add admin_remark text
--  3) re-assert service_role UPDATE — the 20261017210500 grants-defaults
--     migration already covers this table table-wide; re-issued here so
--     the new column/status round-trips through the same path.

do $$
declare con_name text;
begin
  select con.conname
    into con_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'upi_payment_sessions'
     and con.contype = 'c'
     and con.conname like 'upi_payment_sessions_status%';
  if con_name is not null then
    execute format('alter table public.upi_payment_sessions drop constraint %I', con_name);
  end if;
end $$;

alter table public.upi_payment_sessions
  add constraint upi_payment_sessions_status_check
  check (status in ('INITIATED','ACTIVE','SUCCESS','FAILED','EXPIRED','CANCELLED','REJECTED'));

alter table public.upi_payment_sessions add column if not exists admin_remark text;

grant select, insert, update, delete on table public.upi_payment_sessions to service_role;
grant select on table public.upi_payment_sessions to authenticated;
