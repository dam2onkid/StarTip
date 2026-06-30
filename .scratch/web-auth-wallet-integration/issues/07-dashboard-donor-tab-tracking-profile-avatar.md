Status: done

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The dashboard Donor tab vertical slice: a logged-in User sees their donation
history, their rank on the Global Leaderboard and on each Creator's leaderboard,
and can edit their `display_name` + `avatar_url` (including uploading an avatar
to Supabase Storage). Anonymous donations are excluded from leaderboards so the
donor's privacy is preserved.

Create the Supabase Storage bucket `avatars` (public read, owner write via RLS:
`auth.uid() = profiles.user_id`). Both Creator and Donor upload to the same
bucket; the `avatar_url` stored on `profiles` is the public URL of the uploaded
object.

The Donor tab renders:

- Donation history: the user's own donations (all columns, via the donor RLS
  path `auth.uid() = donations.user_id`), most recent first.
- Global rank: the user's position on the Global Leaderboard (logged-in donors
  only; anonymous donations excluded).
- Per-creator rank: the user's position on each Creator's leaderboard where they
  have donated.
- Edit `display_name` and `avatar_url`: a form that updates the Profile via the
  owner UPDATE RLS path (only `display_name`, `avatar_url`, `bio` are
  owner-writable). Avatar upload to the `avatars` bucket, then store the public
  URL as `avatar_url`.

The logged-in donor's `display_name` is used as the Donor Name on their
donations (the donate slice already sources `donor_name` from the Profile when a
session is present).

Tests: Vitest for any extracted donor-stats / leaderboard query helpers
(mocked Supabase, asserts the logged-in-only filter and rank computation).
Playwright E2E for the Donor tab (stubbed Supabase Auth + seeded donations,
asserts history render, global + per-creator rank, display name edit, and
avatar upload producing a public URL on the Profile).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] The `avatars` Storage bucket exists with public read and owner-write RLS
      (`auth.uid() = profiles.user_id`).
- [ ] Donor tab renders the user's donation history (own donations via donor
      RLS).
- [ ] Donor tab renders the user's Global Leaderboard rank (logged-in donors
      only; anonymous donations excluded).
- [ ] Donor tab renders the user's per-creator rank for each Creator they have
      donated to.
- [ ] Donor tab form edits `display_name` and `avatar_url` via the owner UPDATE
      RLS path.
- [ ] Avatar upload stores the public URL on `profiles.avatar_url`.
- [ ] Vitest covers donor-stats / leaderboard query helpers.
- [ ] Playwright covers the Donor tab history, ranks, profile edit, and avatar
      upload.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/05-donate-flow-prepare-confirm-onchain.md`
