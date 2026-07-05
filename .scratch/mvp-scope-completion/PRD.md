Status: ready-for-agent

# MVP Scope Completion

## Problem Statement

StarTip's core onchain/offchain pipeline is built: the DonationRouter contract
settles Donations, the indexer mirrors events into Supabase, the confirm path
fast-confirms, the four-gate Creator onboarding works, the donate form submits
`donate()`, and the Overlay renders Realtime alerts. But several features that
the validated spec (`docs/specs.md` §5.1) explicitly puts **in MVP scope** are
missing, which makes the product feel unfinished for a live demo and a real
launch:

- A Creator has no QR code to show on a livestream. The dashboard only copies
  the Overlay URL as text. The spec's entire premise is "fan scans a QR on a
  livestream," and that QR does not exist.
- A Donor picking a non-native token (e.g. USDC) gets no trustline guidance.
  If they lack a trustline, `donate()` silently fails on-chain with a token
  transfer error, and the donate form surfaces a generic `simulate_failed`.
- The donate form has no quick-select amount buttons (1 / 5 / 10 / custom),
  so a Donor must type every amount.
- The Overlay has no configurable `alert_duration_ms`, no `min_amount` filter,
  and no sound. Alerts never auto-dismiss (they only drop when the queue cap
  of 5 is reached), there is no per-Creator alert threshold, and the spec's
  "optional sound" is absent. The `overlay_settings` table from spec §11.3
  was never migrated.
- There is no donation goal. The spec lists "donation goal progress" as a
  dashboard card and an off-chain concern (§6.2), and it is absent.
- Moderation keyword filtering is specified in ADR-0003 ("runs in both paths,
  at insert time") and the `donations` schema reserves `auto_hidden` as a
  `moderation_status` value, but neither prepare, confirm, nor the indexer
  ever sets it. A donation with a banned word is briefly visible on the
  Overlay until the Creator manually hides it.
- `message` and `donor_name` have no length limits (spec §14.3), so a Donor
  can submit an arbitrarily long string that breaks the Overlay layout and
  bloats the row.

## Solution

Close every gap in spec §5.1 ("In scope") that is not yet implemented.
Concretely:

1. Generate a QR code for the donate link and surface it on the dashboard and
   the public Creator profile, so a Creator can drop it on a livestream and a
   Donor can scan it.
2. Add trustline guidance to the donate form: before building `donate()`, check
   whether the Donor's wallet has a trustline to the selected non-native token;
   if not, build a `change_trust` op for the Donor to sign first, then proceed
   to `donate()`.
3. Add quick-select amount buttons (1, 5, 10, custom) to the donate form.
4. Migrate the `overlay_settings` table (spec §11.3) with public read and owner
   write RLS, wire it into the Overlay (auto-dismiss after
   `alert_duration_ms`, suppress donations below `min_amount`, optional sound),
   and add a dashboard card for the Creator to edit their settings.
5. Add a per-Creator donation goal (off-chain, owner-set target amount) with a
   progress card on the dashboard and the public Creator profile.
6. Implement moderation keyword filtering at insert time in both the prepare and
   confirm paths (and the indexer insert fallback), setting
   `moderation_status = 'auto_hidden'` when a banned keyword matches, so the
   Overlay never briefly shows a flagged message.
7. Enforce `message` and `donor_name` length limits at the prepare boundary.

All onchain behavior is unchanged. The DonationRouter contract is complete and
out of scope for this PRD. Every gap here is off-chain (Supabase schema,
Next.js routes, client logic, config).

## User Stories

### QR code

1. As a Creator, I want a QR code for my donate link on my dashboard, so that
   I can screenshot it and show it on a livestream.
2. As a Creator, I want the QR code to encode my full donate URL
   (`/creator/[handle]/donate`), so that a Donor scanning it lands directly on
   the donate page.
3. As a Creator, I want a "Download QR" button next to the QR image, so that I
   can save a high-resolution PNG for OBS or print.
4. As a Creator, I want the QR code on my public Creator profile page, so that
   a Donor browsing on another device can scan it.
5. As a Donor, I want to scan a QR on a livestream and land on the donate page,
   so that I can tip without typing a URL.
6. As a Donor, I want the scanned QR to resolve to the correct Creator, so that
   my Donation goes to the right person.

### Trustline guidance

7. As a Donor, when I pick a non-native token I do not have a trustline to, I
   want the donate form to tell me I need a trustline, so that I understand
   why a separate signature is required.
8. As a Donor, when I lack a trustline for the selected token, I want the form
   to build a `change_trust` transaction for me to sign first, so that I do
   not have to leave the app and add the trustline manually.
9. As a Donor, after my trustline is established, I want the form to proceed
   automatically to `donate()`, so that the flow feels like one continuous
   action.
10. As a Donor, when the selected token is native XLM, I want the form to skip
    the trustline step entirely, so that I am not asked to sign an unnecessary
    transaction.
11. As a Donor, if my `change_trust` signature is rejected, I want a clear
    error message, so that I know the trustline was not established and the
    donate did not proceed.
12. As a Donor, if I already hold a balance or trustline for the selected
    token, I want the form to skip the trustline step, so that I am not asked
    to re-establish an existing trustline.

### Amount quick-select

13. As a Donor, I want quick-select buttons (1, 5, 10) on the donate form, so
    that I can tip a common amount with one tap.
14. As a Donor, I want a custom amount field alongside the quick-select
    buttons, so that I can enter a non-preset amount.
15. As a Donor, when I tap a quick-select button, I want the custom field to
    reflect the selected amount, so that I see exactly what will be donated.
16. As a Donor, when I edit the custom field after tapping a quick-select
    button, I want the quick-select highlight to clear, so that the form
    reflects my custom entry.

### Overlay settings (alert duration, min amount, sound)

17. As a Creator, I want to set how long each alert stays on screen
    (`alert_duration_ms`), so that alerts match my stream pacing.
18. As a Creator, I want to set a minimum donation amount below which alerts
    do not appear (`min_amount`), so that small donations do not clutter the
    Overlay while still being recorded.
19. As a Creator, I want to toggle overlay sound on or off, so that I can
    choose whether a donation plays an alert sound on stream.
20. As a Creator, I want to edit these overlay settings from my dashboard, so
    that I do not have to touch the database or the contract.
21. As a Creator, I want my overlay settings to apply immediately to my
    Overlay, so that a change takes effect on the next alert without a page
    reload.
22. As a Donor's livestream viewer, I want alerts to disappear after a
    sensible duration, so that the Overlay does not fill up and obscure the
    stream.
23. As a Donor's livestream viewer, I want donations below the Creator's
    threshold to be silently recorded but not shown, so that the Overlay stays
    focused on meaningful alerts.
24. As a Creator, I want a sensible default for `alert_duration_ms` (6000ms),
    `min_amount` (0), and `sound_enabled` (true), so that the Overlay works
    out of the box before I configure it.

### Donation goal

25. As a Creator, I want to set a donation goal amount for my profile, so that
    my supporters can see progress toward a target.
26. As a Creator, I want the goal to be denominated in a single token (the
    MVP allowlist is single-token), so that the progress number is
    meaningful and not a cross-token sum.
27. As a Creator, I want to clear or update my goal at any time, so that I can
    retire a met goal or raise the target.
28. As a Creator, I want a progress card on my dashboard showing current
    amount vs. target, so that I can track progress myself.
29. As a Donor, I want to see a Creator's donation goal progress on their
    public profile, so that I know how close they are to their target.
30. As a Donor, I want the goal progress to reflect only confirmed/indexed
    visible donations in the goal's token, so that the number is trustworthy.

### Moderation keyword filter

31. As a Creator, I want donations containing banned keywords to be
    auto-hidden on the Overlay, so that I do not have to manually hide them
    after they flash on stream.
32. As a Creator, I want auto-hidden donations to still appear in my
    moderation list with `moderation_status = 'auto_hidden'`, so that I can
    review and un-hide a false positive.
33. As a Creator, I want the keyword list to be a fixed MVP set maintained by
    the backend, so that I do not have to configure it.
34. As a Donor, when my message contains a banned keyword, I want my Donation
    to still settle on-chain and be recorded, so that the onchain action is
    never blocked by moderation; only the Overlay visibility is affected.
35. As a platform operator, I want the keyword filter to run at insert time in
    both the prepare and confirm paths and the indexer insert fallback, so
    that a flagged donation is never briefly visible then auto-hidden by a
    second pass (ADR-0003).

### Message and donor name length limits

36. As a Creator, I want donor messages and names bounded in length, so that a
    malicious or careless Donor cannot break my Overlay layout or bloat the
    donation row.
37. As a Donor, when my message exceeds the limit, I want a clear error before
    the on-chain transaction is built, so that I do not sign a Donation whose
    message will be rejected.
38. As a Donor, when my donor name exceeds the limit, I want a clear error
    before the on-chain transaction is built, so that I can shorten it.

## Implementation Decisions

### Modules to build/modify

- **`lib/donations/moderation.ts`** (new): the moderation policy as a pure
  function. `classifyMessage(message, donorName) -> 'visible' | 'auto_hidden'`
  applies a fixed keyword list (case-insensitive substring match on a small
  MVP banned-words array) and is the single source of truth. prepare, confirm,
  and the indexer insert fallback all call it before setting
  `moderation_status`. The function is server-only (no client imports).
- **`lib/donations/validation.ts`** (new): `validateMessage(message)` and
  `validateDonorName(name)` returning `{ ok: true } | { ok: false, error }`.
  Limits: `message` <= 280 chars, `donor_name` <= 32 chars (matching the
  Handle max for symmetry). Called from `prepareDonation` before the pending
  row insert, so an over-limit input never reaches the on-chain build step.
- **`lib/donations/trustline.ts`** (new): `needsTrustline(token, hasTrustline)
  -> boolean` and `buildChangeTrustOp(token, donorAddress) -> xdr.Operation`.
  `needsTrustline` returns `false` for the native XLM SAC (no trustline
  required) and `true` for any non-native token when the Donor has no existing
  trustline/balance. The donate form queries the Donor's balances via the
  wallet/RPC, calls `needsTrustline`, and if true, prepends a `change_trust`
  op to the transaction the Donor signs before `donate()`.
- **`lib/creators/qr.ts`** (new): `buildDonateUrl(handle, origin) -> string`.
  Pure. The QR component renders this string. The dashboard and the public
  Creator profile both call it.
- **`lib/overlay/settings.ts`** (new): `shouldShowAlert(donation, settings)
  -> boolean` (checks `amount >= min_amount` after converting display units)
  and `alertDurationMs(settings) -> number` (defaults to 6000). Pure. The
  Overlay client calls these.
- **`lib/creators/goal.ts`** (new): `goalProgress(donations, target) ->
  { current: string, target: string, pct: number }`. Pure, mirrors the
  `aggregateLeaderboard` / `sumDonationStats` pattern in `leaderboard.ts`.
  Sums raw `amount` with `BigInt` for the goal's token only.
- **`lib/donations/prepare.ts`** (modify): call `validateMessage` /
  `validateDonorName` and return `400 invalid_message` / `invalid_donor_name`
  on failure; call `classifyMessage` and set the pending row's
  `moderation_status` accordingly.
- **`lib/donations/confirm.ts`** (modify): on the no-existing-row insert
  fallback, call `classifyMessage` for the (unknown) message; on the
  promote-existing-row path, re-run `classifyMessage` only if the row is still
  `pending` (so a prepare-time `auto_hidden` is not overwritten).
- **`lib/indexer/dispatch.ts`** (modify): on the orphan-donation insert
  fallback, default `moderation_status` to `auto_hidden` if a keyword match
  would flag it (the indexer has no message, so it cannot filter; this path
  only fires when prepare never ran, in which case there is no message to
  filter, so the row is `visible` with `donor_name = "Anonymous"`). No change
  to the promote-existing-row path.
- **`app/(auth)/dashboard/creator-tab.tsx`** (modify): add a QR card (renders
  the QR image + download button), an Overlay Settings card
  (`alert_duration_ms`, `min_amount`, `sound_enabled`), and a Donation Goal
  card to the active Creator panel.
- **`app/(public)/creator/[handle]/page.tsx`** (modify): render the QR code
  and the donation goal progress on the public profile.
- **`app/(public)/creator/[handle]/donate/donate-form.tsx`** (modify): add
  quick-select amount buttons, trustline guidance + `change_trust` op
  prepending, and surface `invalid_message` / `invalid_donor_name` errors.
- **`app/(public)/overlay/[handle]/overlay-alerts.tsx`** (modify): load the
  Creator's `overlay_settings` row (passed from the server component), apply
  `shouldShowAlert` and `alertDurationMs`, auto-dismiss each alert after the
  configured duration, and play a sound on insert when `sound_enabled`.
- **`app/api/overlay-settings/route.ts`** (new): `GET`/`PUT` for the
  authenticated Creator to read and update their settings. Validates
  `alert_duration_ms` (1000-60000), `min_amount` (>= 0), `sound_enabled`
  (boolean). Writes via the browser client RLS path (owner write).
- **`app/api/creators/[handle]/goal/route.ts`** (new): `GET` public read of
  the goal; `PUT` authed owner write of the target amount + token.

### Schema changes

- **`overlay_settings` table** (spec §11.3): `id`, `creator_profile_id`
  (references `profiles(id)` on delete cascade), `alert_duration_ms integer
  default 6000`, `min_amount numeric default 0`, `sound_enabled boolean
  default true`, `theme text default 'default'`, `created_at`, `updated_at`.
  RLS: public read; owner write (`auth.uid() = profiles.user_id` join on
  `creator_profile_id`). One row per Creator, created lazily on first
  dashboard load or first Overlay fetch via an upsert.
- **`donation_goals` table** (new): `id`, `creator_profile_id` (references
  `profiles(id)` on delete cascade, unique), `target_amount numeric not null`,
  `token text not null` (must be in `tokens` allowlist), `created_at`,
  `updated_at`. RLS: public read; owner write. One row per Creator (nullable
  goal: no row = no goal displayed).

### API contracts

- `GET /api/overlay-settings?handle=<handle>` -> public read of the
  Creator's settings row (or defaults if no row).
- `PUT /api/overlay-settings` (authed) -> `{ alert_duration_ms, min_amount,
  sound_enabled }` -> upserts the caller's row.
- `GET /api/creators/[handle]/goal` -> `{ target_amount, token } | null`.
- `PUT /api/creators/[handle]/goal` (authed owner) -> `{ target_amount,
  token }` -> upserts the caller's row. `target_amount = 0` deletes the row
  (clears the goal).
- `POST /api/donations/prepare` gains two error codes: `invalid_message`,
  `invalid_donor_name` (400). The success body is unchanged.
- The moderation keyword filter is not exposed as an API; it is a library
  function called inside prepare/confirm/indexer.

### Specific interactions

- **Trustline flow:** the donate form fetches the Donor's trustlines/balances
  for the selected token via the RPC `getAccount` response (which includes
  trustlines). If `needsTrustline` is true, the form builds a two-op
  transaction (`change_trust` then `donate()`), the Donor signs once, and the
  form submits. If the `change_trust` fails at simulation, the form surfaces a
  `trustline_failed` error and does not submit `donate()`. The existing
  `__STARTIP_DONATE_STUB__` E2E seam is extended to cover the two-op path.
- **Overlay auto-dismiss:** each `AlertCard` starts a timer on mount
  (`alertDurationMs(settings)`). On expiry, the alert is removed from the
  queue. The existing `MAX_ALERTS = 5` cap remains as a safety bound. The
  timer is cleared on unmount. `prefers-reduced-motion` does not disable the
  timer (it only affects the animation).
- **Overlay min_amount:** `shouldShowAlert` compares the donation's raw
  `amount` (i128) against `min_amount` (stored as a display-amount numeric,
  converted to raw via the token's `decimals` from the `tokens` table). The
  server component passes the resolved `min_amount` in raw units to the
  client to avoid a per-alert decimals lookup.
- **Overlay sound:** a single short alert sound (a bundled asset in
  `/public`) plays on insert when `sound_enabled` is true and the browser
  allows autoplay (gated on a prior user interaction; the Overlay is a browser
  source so OBS provides the interaction context). No sound on the initial
  server-rendered donations, only on Realtime inserts.
- **Moderation keyword list:** a fixed array in `lib/donations/moderation.ts`
  for the MVP (a small set of obvious banned words). Not admin-configurable in
  the MVP (admin ops run via the `stellar` CLI per ADR-0001, and the keyword
  list is off-chain, so it lives in code). Case-insensitive substring match.
  The list is intentionally short to avoid false positives; the Creator can
  always un-hide a false positive from the moderation list.
- **QR rendering:** use a client-side QR library (e.g. `qrcode` or
  `qrcode.react`) added as a dependency. The QR encodes `buildDonateUrl(handle,
  origin)`. The dashboard card renders the QR as an `<svg>`/`<canvas>` and
  offers a "Download PNG" button. The public Creator profile renders the same
  QR.

## Testing Decisions

### What makes a good test

Tests assert external behavior, not implementation details. A good test in
this codebase drives a public function or a rendered component with inputs,
asserts the observable output or DOM, and does not peek at private state or
mock internals beyond the documented test seams (`__STARTIP_*_STUB__` window
globals). Pure lib functions are tested with vitest; components with vitest +
jsdom + Testing Library; DB policies with `supabase/tests/*.test.sql`; E2E
flows with Playwright using the existing stub seams.

### Modules to test

- **`lib/donations/moderation.ts`** — vitest. Assert `classifyMessage` returns
  `'auto_hidden'` for banned keywords (case-insensitive, substring), `'visible'`
  for clean input, and handles empty/null message. Prior art:
  `lib/donations/prepare.test.ts`, `lib/indexer/dispatch.test.ts`.
- **`lib/donations/validation.ts`** — vitest. Assert `validateMessage` /
  `validateDonorName` reject over-limit input and accept valid input. Prior
  art: `lib/creators/handle.test.ts`.
- **`lib/donations/trustline.ts`** — vitest. Assert `needsTrustline` returns
  false for native XLM and for a token the Donor already has a trustline to,
  true for a non-native token with no trustline. Assert `buildChangeTrustOp`
  produces a valid `ChangeTrust` op XDR. Prior art: `lib/donations/donate.test.ts`.
- **`lib/creators/qr.ts`** — vitest. Assert `buildDonateUrl` produces the
  correct absolute URL for a given handle and origin. Prior art:
  `lib/creators/handle.test.ts`.
- **`lib/overlay/settings.ts`** — vitest. Assert `shouldShowAlert` filters
  below `min_amount` (in raw units) and `alertDurationMs` returns the
  configured value or the 6000 default. Prior art: `lib/creators/leaderboard.test.ts`.
- **`lib/creators/goal.ts`** — vitest. Assert `goalProgress` sums correctly
  with `BigInt`, handles zero donations, and computes `pct` clamped to 0-100.
  Prior art: `lib/creators/leaderboard.test.ts`.
- **`lib/donations/prepare.ts`** (modified) — extend `prepare.test.ts` to
  assert `invalid_message` / `invalid_donor_name` 400s and that a banned
  keyword produces a pending row with `moderation_status = 'auto_hidden'`.
- **`lib/donations/confirm.ts`** (modified) — extend `confirm.test.ts` to
  assert the no-existing-row insert calls `classifyMessage`.
- **`app/api/overlay-settings/route.test.ts`** (new) — assert public GET
  returns defaults for a Creator with no row, owner PUT upserts, non-owner PUT
  403s. Prior art: `app/api/creators/route.test.ts`.
- **`app/api/creators/[handle]/goal/route.test.ts`** (new) — assert public GET,
  owner PUT, non-owner PUT 403, `target_amount = 0` deletes. Prior art:
  `app/api/creators/[handle]/route.test.ts`.
- **`supabase/tests/overlay_settings_rls.test.sql`** (new) — assert public
  SELECT, owner UPDATE, non-owner UPDATE denied. Prior art:
  `supabase/tests/profiles_rls.test.sql`.
- **`supabase/tests/donation_goals_rls.test.sql`** (new) — assert public
  SELECT, owner INSERT/UPDATE/DELETE, non-owner denied. Prior art:
  `supabase/tests/profiles_rls.test.sql`.
- **`app/(public)/overlay/[handle]/overlay-alerts.test.tsx`** (extend) —
  assert auto-dismiss removes an alert after `alertDurationMs`, assert a
  donation below `min_amount` is not rendered, assert sound is not played when
  `sound_enabled = false`. Use fake timers. Prior art: existing
  `overlay-alerts.test.tsx`.
- **`app/(public)/creator/[handle]/donate/donate-form.test.tsx`** (extend) —
  assert quick-select buttons set the amount, assert trustline guidance
  renders when `needsTrustline` is true, assert `invalid_message` error
  renders. Prior art: existing `donate-form.test.tsx`.
- **`app/(auth)/dashboard/creator-tab.test.tsx`** (extend) — assert the QR
  card renders an image with the donate URL, assert the Overlay Settings card
  saves via the API, assert the Donation Goal card renders progress. Prior
  art: existing `creator-tab.test.tsx`.
- **Playwright E2E** (extend) — one new flow: donate a non-native token with
  no trustline, assert the `change_trust` + `donate()` two-op path via the
  `__STARTIP_DONATE_STUB__` seam. Prior art: existing donate E2E in `tests/`.

## Out of Scope

- **DonationRouter contract changes** — the contract is complete; no new
  function, event, or error code.
- **Custom alert themes** (spec §5.2 optional) — `theme` column is migrated
  with a `'default'` value but no theme picker UI is built.
- **Per-stream donation goals and leaderboards** (spec §5.2 optional) — the
  `streams` table is not reintroduced; the goal is per-Creator.
- **Passkey / smart-account wallet UX** (spec §5.2 optional).
- **Sponsored transaction fees** (spec §5.2 optional).
- **SEP-0010 to replace `signMessage`** (spec §5.2 optional).
- **Admin-configurable keyword list** — the MVP keyword list is fixed in code.
  An admin UI for moderation keywords is out of scope (admin ops run via the
  `stellar` CLI per ADR-0001, and the keyword list is off-chain).
- **Admin panel UI** (spec §5.3 out of scope).
- **Fiat on/off-ramp, KYC, escrow/refund, subscriptions, NFT badges, native
  mobile app** (spec §5.3 out of scope).
- **Global `paused` mirror off-chain** — the indexer skips
  `PausedChanged`; surfacing global-pause state in the dashboard is a separate
  concern and not required for MVP demo success.
- **Production indexer scheduler / `vercel.json` cron** — the indexer poll
  route exists and works; wiring a production cron is deferred to a separate
  PRD. The local `scripts/indexer-cron.mjs` remains the dev-time scheduler.

## Further Notes

- The moderation keyword filter is the highest-risk gap for a live demo: a
  banned word flashing on the Overlay is the most visible failure mode. It
  should be implemented first.
- The QR code is the highest-impact gap for the demo script (spec §17 step 6
  "show QR and overlay URL"): without it, the "scan a QR" premise is absent.
- All new lib modules are server-only where they touch Supabase or Stellar
  RPC, and pure/client-safe where they do not. The split mirrors the existing
  `lib/creators/` and `lib/donations/` conventions.
- The `overlay_settings` and `donation_goals` tables follow the existing RLS
  pattern (public read, owner write via `profiles.user_id` join) and the
  existing migration naming convention
  (`supabase/migrations/<timestamp>_<name>.sql`).
