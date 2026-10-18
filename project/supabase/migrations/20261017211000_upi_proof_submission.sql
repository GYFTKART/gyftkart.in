-- 20261017211000_upi_proof_submission.sql
--
-- Customer-submitted payment evidence for UPI Direct sessions:
--   customer_utr : 12-digit reference captured by the buyer on checkout
--   proof_path   : storage.objects path under bucket `upi-payment-proofs`
--
-- Extended columns inherit the table-level grants added in
-- 20261017210500. The evidence is review material ONLY: only the admin
-- confirm endpoint (admin JWT + admins row) can mark a session SUCCESS.
--
alter table public.upi_payment_sessions add column if not exists customer_utr text;
alter table public.upi_payment_sessions add column if not exists proof_path text;

-- Private bucket for payment screenshots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('upi-payment-proofs', 'upi-payment-proofs', false, 3145728,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Buyers upload only inside their own folder (first path segment).
drop policy if exists upi_proof_own_upload on storage.objects;
create policy upi_proof_own_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'upi-payment-proofs'
    and (storage.foldername(name))[1] = 'user-' || auth.uid()::text
  );

-- Admins (admins table rows) may view submitted proofs.
drop policy if exists upi_proof_admin_read on storage.objects;
create policy upi_proof_admin_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'upi-payment-proofs'
    and exists (select 1 from public.admins a where a.id = auth.uid())
  );
