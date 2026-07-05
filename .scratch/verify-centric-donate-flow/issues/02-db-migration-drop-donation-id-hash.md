# 02 - DB migration: drop donation_id_hash, add status CHECK

Status: done
Role: backend

## Task

Migrate the `donations` table to match ADR-0005: drop the
`donation_id_hash` column and its index, constrain `status` to
`confirmed`/`indexed` (no `pending`).

## Changes

### New migration: `apps/web/supabase/migrations/20260705000001_donations_drop_donation_id_hash.sql`

```sql
-- ADR-0005: drop donation_id_hash. tx_hash is now the sole natural key.
-- The prepare endpoint is removed, so no pending rows are created; status
-- is constrained to confirmed/indexed.

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
```

### Update migration comment in `20260629000002_donations.sql`

The header comment references `donation_id_hash` and the prepare -> confirm ->
indexed flow. Update to reflect the verify-centric flow (ADR-0005). The
original migration file stays as-is for history; the new migration is
additive.

## Verification

- `supabase db reset` applies all migrations without error.
- `\d donations` shows no `donation_id_hash` column, no
  `donations_donation_id_hash_idx` index, and a `donations_status_check`
  constraint.
- Inserting a row with `status = 'pending'` fails with CHECK violation.

## Dependencies

- Issue 01 (contract change) should land first or simultaneously, since the
  contract no longer emits `donation_id_hash` in events.

## Comments

- Review (2026-07-05): the original SQL snippet used
  `drop column if exists public.donations.donation_id_hash`, which is invalid
  syntax (`drop column if exists` does not take a schema-qualified column
  reference). Fixed to `drop column if exists donation_id_hash`. Triaged
  `ready-for-agent`: self-contained, precise diff, clear verification steps.
- Impl (2026-07-05): landed as
  `web/supabase/migrations/20260705000002_donations_drop_donation_id_hash.sql`
  (timestamp bumped from `20260705000001` to avoid colliding with the existing
  `20260705000001_donation_goals.sql`; path is `web/` not `apps/web/` per the
  actual repo layout). SQL matches the issue spec verbatim, including the
  reviewed syntax fix. Original `20260629000002_donations.sql` left as-is for
  history (additive migration).
- Impl (2026-07-05): updated `web/supabase/tests/donations_rls.test.sql` for
  the new schema: `hasnt_column('donation_id_hash')`, the `pending` fixture
  row became an `indexed` row, anon/public_donations counts adjusted (1 -> 2),
  and a new `throws_ok` asserting `status='pending'` insert fails the
  `donations_status_check` (SQLSTATE 23514). Plan went from 20 to 21 tests.
- Impl (2026-07-05): could not run `supabase db reset` / `supabase test`
  locally, Docker is not installed on this machine. `pnpm typecheck` and the
  full vitest suite (435 tests, 53 files) pass. DB verification deferred to
  the next environment with Docker available.
