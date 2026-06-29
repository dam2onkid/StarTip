Status: done

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The public discovery vertical slice: a Visitor browses active Creators on
`/creator/explore` (with the Global Leaderboard), clicks into a Creator's
public page `/creator/[handle]` (profile, stats, per-creator leaderboard, donate
CTA), and `/docs` as a static placeholder. None of these routes require auth.

`GET /api/creators/[handle]` (public): return a Creator's public profile
(`handle`, `display_name`, `avatar_url`, `bio`, `onchain_registered`) for rows
where `onchain_registered = true AND paused = false`. 404 if not found or not
public. This is the read consumed by `/creator/[handle]`.

`/creator/explore`: list active Creators (display name, avatar, Handle) from
`profiles` where `onchain_registered = true AND paused = false`. Render the
Global Leaderboard (top Donors by aggregate donated amount across all Creators,
Donor Name + total amount; only donations with a `user_id` contribute, anonymous
donations are excluded). Each Creator row links to `/creator/[handle]`.

`/creator/[handle]`: render the Creator's public profile (display name, avatar,
bio), donation stats (total received, count), and the per-creator leaderboard
(top Donors to this Creator, Donor Name + total amount; logged-in donors only).
A "Donate" CTA links to `/creator/[handle]/donate`.

`/docs`: static placeholder page ("Documentation coming soon").

Tests: Vitest for `GET /api/creators/[handle]` (mocked Supabase, asserts public
fields returned, 404 for unknown / not-registered / paused). Playwright E2E for
`/creator/explore` (asserts active creator list + global leaderboard render,
clicking a creator navigates to `/creator/[handle]`), `/creator/[handle]`
(asserts profile, stats, per-creator leaderboard, donate CTA links to the donate
page), and `/docs` (asserts placeholder renders).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [x] `GET /api/creators/[handle]` returns public fields for registered +
      not-paused creators and 404 otherwise.
- [x] `/creator/explore` lists active Creators (display name, avatar, Handle)
      and renders the Global Leaderboard (logged-in donors only).
- [x] Each Creator in the explore list links to `/creator/[handle]`.
- [x] `/creator/[handle]` renders the Creator's public profile, donation stats,
      per-creator leaderboard, and a Donate CTA to `/creator/[handle]/donate`.
- [x] `/docs` renders a static placeholder.
- [x] Vitest covers `GET /api/creators/[handle]` public/404 paths.
- [x] Playwright covers explore, creator page, and docs.
- [x] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/04-creator-onboarding-four-gate-state-machine.md`
- `.scratch/web-auth-wallet-integration/issues/05-donate-flow-prepare-confirm-onchain.md`
