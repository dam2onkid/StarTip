Status: ready-for-agent

## Parent

`.scratch/mvp-scope-completion/PRD.md`

## What to build

The donation goal vertical slice. A Creator can set a donation goal (a target
amount denominated in a single token from the allowlist) for their profile.
The dashboard shows a progress card (current amount vs. target), and the
public Creator profile shows a progress bar. The progress reflects only
confirmed/indexed visible donations in the goal's token. The Creator can
clear or update the goal at any time.

Schema: a new `donation_goals` table with `id`, `creator_profile_id`
(references `profiles(id)` on delete cascade, unique), `target_amount numeric
not null`, `token text not null` (must be in the `tokens` allowlist),
`created_at`, `updated_at`. RLS: public read; owner write. One row per
Creator (no row = no goal displayed).

A new pure library module holds the aggregation logic, mirroring the
`aggregateLeaderboard` / `sumDonationStats` pattern:

- `lib/creators/goal.ts`: `goalProgress(donations, target) ->
  { current: string, target: string, pct: number }`. Sums raw `amount` with
  `BigInt` for the goal's token only; `pct` clamped to 0-100.

API: `GET /api/creators/[handle]/goal` for public read (returns
`{ target_amount, token } | null`); `PUT /api/creators/[handle]/goal`
(authed owner) to upsert the row; `target_amount = 0` deletes the row
(clears the goal).

UI: the dashboard active Creator panel gets a Donation Goal card (set target
amount + token, see progress, clear goal). The public Creator profile renders
a progress bar from confirmed/indexed visible donations in the goal's token.

## Acceptance criteria

- [ ] The `donation_goals` table migration exists with the specified columns.
- [ ] RLS allows public SELECT and owner INSERT/UPDATE/DELETE; non-owner
      writes are denied.
- [ ] `goalProgress` sums raw `amount` with `BigInt` for the goal's token,
      handles zero donations, and computes `pct` clamped to 0-100.
- [ ] `GET /api/creators/[handle]/goal` returns the goal or `null`.
- [ ] `PUT /api/creators/[handle]/goal` (authed owner) upserts the row;
      `target_amount = 0` deletes the row; non-owner PUT is rejected.
- [ ] The dashboard active Creator panel has a Donation Goal card that sets
      the target amount + token, shows progress, and clears the goal.
- [ ] The public Creator profile renders a progress bar from
      confirmed/indexed visible donations in the goal's token.
- [ ] `supabase/tests/donation_goals_rls.test.sql` covers public SELECT,
      owner writes, non-owner denied.
- [ ] vitest covers `goalProgress`.
- [ ] `app/api/creators/[handle]/goal/route.test.ts` covers public GET, owner
      PUT, non-owner PUT 403, `target_amount = 0` deletes.
- [ ] `creator-tab.test.tsx` is extended to assert the Donation Goal card
      renders progress.
- [ ] `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None - can start immediately
