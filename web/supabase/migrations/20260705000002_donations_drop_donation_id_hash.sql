-- ADR-0005: drop donation_id_hash. tx_hash is now the sole natural key.
-- The prepare endpoint is removed, so no pending rows are created; status
-- is constrained to confirmed/indexed.
--
-- Supersedes the donation_id_hash column and index introduced in
-- 20260629000002_donations.sql, and the pending -> confirm -> indexed flow
-- described there. The original migration file is left as-is for history;
-- this migration is additive.

-- Delete any legacy pending rows before adding the CHECK constraint.
delete from public.donations where status = 'pending';

-- Drop the index and column.
drop index if exists public.donations_donation_id_hash_idx;
alter table public.donations drop column if exists donation_id_hash;

-- Constrain status to the two valid values.
alter table public.donations
  drop constraint if exists donations_status_check;
alter table public.donations
  add constraint donations_status_check check (status in ('confirmed', 'indexed'));
