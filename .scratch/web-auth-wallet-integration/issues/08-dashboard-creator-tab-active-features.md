Status: done

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The dashboard Creator tab active-features vertical slice: once a Creator is
on-chain registered (`onchain_registered = true`), the Creator tab unlocks
stats, leaderboard, payout updates, self-pause/unpause, profile editing, avatar
upload, the Overlay URL, and donation moderation. All on-chain actions
(`update_creator_payout`, `set_creator_active_owner`) follow the same
client-builds + wallet-signs + submits-to-RPC pattern as `register_creator`, and
the dashboard waits for the indexer to mirror the change via Supabase Realtime
(ADR-0003: no optimistic UI for these events).

Creator tab sections (gated by `onchain_registered = true`):

- Stats: total received, count, recent donations (creator RLS path via
  `creator_profile_id` join, including hidden donations).
- Per-creator leaderboard: top Donors to this Creator (logged-in donors only).
- Payout update: enter a new Payout Address (warn if it equals the contract
  address or Treasury, ADR-0004), client builds + signs + submits
  `update_creator_payout(handle_hash, new_payout_address)`, show "payout update
  pending", subscribe to Realtime on the Profile row and flip when the indexer
  mirrors `payout_address`.
- Self-pause / unpause: client builds + signs + submits
  `set_creator_active_owner(handle_hash, active)` (the owner entrypoint,
  ADR-0004), show pending, subscribe to Realtime and flip when the indexer
  mirrors `paused`. Show current paused/active status.
- Edit `display_name`, `avatar_url`, `bio` via the owner UPDATE RLS path; avatar
  upload to the `avatars` bucket (shared with the Donor tab slice).
- Overlay URL: show `/overlay/[handle]` with a copy action.
- Moderation: list incoming donations (including hidden), set
  `moderation_status` to `visible` or `hidden` via the creator
  `moderation_status` UPDATE RLS path. Hidden donations do not appear on the
  Overlay.
- On-chain status: show `onchain_registered`, `owner_address`, `payout_address`.

Tests: Vitest for any extracted creator-stats / moderation update helpers
(mocked Supabase, asserts moderation RLS path and stats queries). Playwright E2E
for the Creator tab with a stubbed test wallet (asserts stats render, payout
update signs + submits + Realtime flip, self-pause/unpause signs + submits +
Realtime flip, profile edit, overlay URL copy, and moderation toggling a
donation's visibility).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] Creator tab sections render only when `onchain_registered = true`.
- [ ] Stats show total received, count, and recent donations (including hidden,
      via creator RLS).
- [ ] Per-creator leaderboard renders (logged-in donors only).
- [ ] Payout update signs + submits `update_creator_payout`, shows pending, and
      flips via Realtime when the indexer mirrors `payout_address`.
- [ ] Payout entry warns when the address equals the contract address or
      Treasury.
- [ ] Self-pause/unpause signs + submits `set_creator_active_owner`, shows
      pending, and flips via Realtime when the indexer mirrors `paused`.
- [ ] Current paused/active status is displayed.
- [ ] Profile edit updates `display_name`, `avatar_url`, `bio` via owner RLS;
      avatar upload stores the public URL.
- [ ] Overlay URL `/overlay/[handle]` is shown with a copy action.
- [ ] Moderation lists donations (including hidden) and toggles
      `moderation_status` via the creator RLS path.
- [ ] On-chain status (`onchain_registered`, `owner_address`, `payout_address`)
      is displayed.
- [ ] Vitest covers creator-stats and moderation helpers.
- [ ] Playwright covers the Creator tab flows with a stubbed wallet.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/03-indexer-poll-shared-cursor-all-events.md`
- `.scratch/web-auth-wallet-integration/issues/04-creator-onboarding-four-gate-state-machine.md`
- `.scratch/web-auth-wallet-integration/issues/05-donate-flow-prepare-confirm-onchain.md`
