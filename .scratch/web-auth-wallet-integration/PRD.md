Status: ready-for-agent

# PRD — Web auth + wallet integration

## Problem Statement

StarTip's web app (`web/`) has a scaffold with route groups, Supabase SSR
middleware, Stellar lib splits, and API route stubs, but none of the auth or
wallet flows are implemented. A User cannot log in, cannot become a Creator,
cannot link a wallet, cannot register on-chain, and cannot donate. The
DonationRouter contract is deployed and tested, the domain model
(`CONTEXT.md`) and ADRs (0001, 0002, 0003, 0004) are settled, but the web app
has no working consumer surface for any of it.

The scaffold's route shape (`(auth)/dashboard/{profile,wallet,payout,overlay,donations}`,
`(auth)/onboarding`, `api/{creators,wallet/link,donations/{prepare,confirm},indexer/poll}`)
was locked by the `web-landing-page` PRD but the grilling session that produced
this PRD revised the route structure: routes are flattened, donor is the
default role, creator is opt-in, onboarding is inline in the dashboard, and
explore/creator pages are public discovery surfaces. The scaffold must be
restructured and the real flows built on top of it.

This PRD covers the full auth + wallet integration: Supabase magic link login,
Profile autocreation, the four-gate Creator onboarding state machine, wallet
link via `signMessage`, on-chain `register_creator` from the client, the donate
flow (anonymous + logged-in), the indexer poll job that mirrors all
DonationRouter events into Supabase, the Supabase schema (`profiles`,
`donations`, `tokens`, `indexer_state`) with RLS, and the public discovery
routes (`/creator/explore`, `/creator/[handle]`, `/creator/[handle]/donate`).

## Solution

Build the auth and wallet integration as a set of layers, each consuming the
one below:

1. **Supabase schema + RLS** (`profiles`, `donations`, `tokens`,
   `indexer_state`) as migrations under `web/supabase/migrations/`. A trigger
   autocreates a `profiles` row on first login. RLS keys off
   `auth.uid() = profiles.user_id` for owner access; public read policies cover
   only public fields. A cron job deletes Reserved Handles older than 7 days.

2. **Supabase Auth (magic link)** as the sole login mechanism. One `/login`
   page for both Creator and Donor. After magic link callback, redirect logic:
   if `next` param present, return there; otherwise, if Profile has a Handle
   and `onchain_registered = true`, go to `/dashboard`; if Profile has a Handle
   but not registered, go to `/dashboard` (onboarding continues inline); if no
   Handle, go to `/dashboard` (donor default, Creator opt-in via a "Become a
 Creator" action).

3. **Wallet link** via Stellar Wallets Kit V2 (`signMessage`). Two API
   endpoints: `/api/wallet/link/challenge` (generate nonce, store on Profile
   row, return human-readable challenge string) and `/api/wallet/link` (verify
   `signMessage` signature via `Keypair.fromPublicKey(address).verifyMessage`,
   check nonce + expiry, write `owner_address`, null nonce). Re-link allowed
   only while `onchain_registered = false`.

4. **Creator onboarding** as a four-gate state machine inline in the
   `/dashboard` Creator tab: claim Handle (API route checks Postgres unique +
   on-chain `get_creator`), link wallet, set Payout Address + sign
   `register_creator(handle_hash, payout_address)` on-chain (client builds +
   signs + submits directly to Soroban RPC), wait for indexer to flip
   `onchain_registered = true` via Supabase Realtime subscription.

5. **Donate flow** at `/creator/[handle]/donate`: `/api/donations/prepare`
   creates a pending `donations` row with `donation_id = id`,
   `donation_id_hash = sha256(id)`, stores `user_id` if session present
   (anonymous = NULL), returns metadata. Client builds + signs + submits
   `donate()` directly to RPC. `/api/donations/confirm` verifies the tx +
   `DonationReceived` event on-chain, upserts by `tx_hash`, extracts
   `donor_address` from tx source, sets `status = confirmed`.

6. **Indexer** (`/api/indexer/poll`) as a single poll job: one
   `getEvents` call filtered by contract ID, dispatch by topic name. Mirrors
   `DonationReceived` (upsert by `tx_hash`), `CreatorRegistered` (flip
   `onchain_registered`), `CreatorPayoutUpdated` (mirror `payout_address`),
   `CreatorActiveChanged` (mirror `paused`), `TokenAllowlistUpdated` (insert/
   delete `tokens` row with one-time contract read for metadata). Single shared
   cursor in `indexer_state`. Idempotent for all event types.

7. **Public discovery routes**: `/creator/explore` (browse active creators +
   global leaderboard), `/creator/[handle]` (creator public page: profile,
   stats, per-creator leaderboard, donate CTA), `/creator/[handle]/donate`
   (donate form with token picker + wallet connect). `/dashboard` with tabs:
   Donor (history, rank, edit display name + avatar) and Creator (onboarding
   inline, stats, leaderboard, wallet link, payout, overlay, moderation).
   `/docs` as a static placeholder.

## User Stories

### Login + Profile

1. As a Visitor, I want to see a login page with an email input, so that I can
   request a magic link to log in.
2. As a Visitor, I want to enter my email and click "Send magic link", so that
   I receive a login link in my inbox without needing a password.
3. As a Visitor, I want to click the magic link in my email and be redirected
   back to the page I was on, so that I do not lose my place after logging in.
4. As a first-time User, I want a Profile row to be created automatically when
   I log in for the first time, so that I do not have to explicitly create an
   account.
5. As a first-time User, I want my Profile to default to `display_name =
   "Anonymous"` and `avatar_url = NULL`, so that I can start using the app
   immediately without filling out a profile.
6. As a User, I want to be redirected to `/dashboard` after login if I have no
   `next` param, so that I land on a sensible default page.
7. As a User, I want to be redirected to my original page after login if a
   `next` param is present, so that I can resume what I was doing.
8. As a User, I want my Supabase session to be refreshed on every request, so
   that I do not get logged out unexpectedly.
9. As a User, I want to be redirected to `/login` if I try to access
   `/dashboard` without a session, so that I am prompted to log in.
10. As a User, I want to log out from the dashboard, so that I end my session.

### Donor (default role)

11. As a Visitor, I want to browse `/creator/explore` without logging in, so
    that I can discover Creators before committing to an account.
12. As a Visitor, I want to see a list of active Creators with their display
    name, avatar, and Handle, so that I can pick who to donate to.
13. As a Visitor, I want to see the Global Leaderboard on `/creator/explore`,
    so that I can see top Donors across all Creators.
14. As a Visitor, I want to click a Creator in the explore list and land on
    `/creator/[handle]`, so that I can see their public profile.
15. As a Visitor, I want to see a Creator's profile (display name, avatar, bio),
    donation stats, and per-creator leaderboard on `/creator/[handle]`, so that
    I can decide whether to donate.
16. As a Visitor, I want to click "Donate" on `/creator/[handle]` and be taken
    to `/creator/[handle]/donate`, so that I can initiate a donation.
17. As a Donor, I want to connect my Stellar wallet on the donate page without
    logging in, so that I can donate anonymously.
18. As an anonymous Donor, I want to enter a donor name (defaulting to
    "Anonymous") and a message on the donate page, so that my donation has a
    personal touch without requiring an account.
19. As an anonymous Donor, I want to select a token from the Token Allowlist
    rendered with human-readable metadata (symbol, name, icon), so that I know
    what I am sending.
20. As an anonymous Donor, I want to enter an amount and see it converted using
    the token's decimals, so that I do not accidentally send 1000x what I
    intended.
21. As a Donor, I want the donate page to call `/api/donations/prepare` and
    receive a `donation_id_hash`, so that the donation is linked to an
    off-chain record.
22. As a Donor, I want my wallet to sign the `donate()` transaction and submit
    it directly to the Stellar network, so that the donation settles on-chain
    without the backend holding my funds.
23. As a Donor, after my transaction is submitted, I want the page to post the
    tx hash to `/api/donations/confirm`, so that the donation appears on the
    Creator's Overlay as fast as possible.
24. As a Donor, I want to see a success confirmation after my donation is
    confirmed, so that I know it went through.
25. As a Donor, I want to see a clear error if my transaction fails (e.g.
    Creator paused, token not allowed, insufficient balance), so that I can
    understand what went wrong.

### Donor (logged-in, tracked)

26. As a logged-in User, I want to donate and have my `user_id` stored on the
    Donation record, so that my donations are tracked for leaderboard ranking.
27. As a logged-in User, I want my Profile `display_name` to be used as the
    Donor Name on my donations, so that I do not have to re-enter it each time.
28. As a logged-in User, I want to see my donation history in the `/dashboard`
    Donor tab, so that I can review my past donations.
29. As a logged-in User, I want to see my rank on the Global Leaderboard, so
    that I can track my standing.
30. As a logged-in User, I want to see my rank on a Creator's leaderboard, so
    that I can track my standing with a specific Creator.
31. As a logged-in User, I want to edit my `display_name` and `avatar_url` in
    the `/dashboard` Donor tab, so that I can personalize my donor identity.
32. As a logged-in User, I want to upload an avatar to Supabase Storage, so
    that my avatar is hosted and displayed on donations and leaderboards.
33. As a logged-in User, I want my donations to count towards leaderboards,
    so that my tracked activity is reflected publicly.
34. As an anonymous Donor, I want my donations to NOT appear on leaderboards,
    so that my privacy is preserved.

### Creator onboarding

35. As a User, I want to see a "Become a Creator" action in the `/dashboard`
    Donor tab, so that I can opt into becoming a Creator.
36. As a User becoming a Creator, I want to claim a Handle by entering it in
    the onboarding form, so that I get a unique URL (`/creator/[handle]`).
37. As a User claiming a Handle, I want to see if the Handle is already taken
    (off-chain reserved or on-chain registered) before submitting, so that I
    do not waste time on a taken name.
38. As a User claiming a Handle, I want the backend to check both the
    `profiles` table and the on-chain `get_creator(sha256(handle))` before
    accepting, so that no conflict arises later at `register_creator`.
39. As a User who claimed a Handle, I want my Profile to store the `handle` and
    `handle_hash`, so that my Handle is reserved off-chain.
40. As a User who claimed a Handle but has not linked a wallet, I want the
    onboarding to prompt me to link a wallet, so that I can proceed to
    on-chain registration.
41. As a User linking a wallet, I want to connect my Stellar wallet via
    Stellar Wallets Kit, so that the app knows my wallet address.
42. As a User linking a wallet, I want to see a human-readable challenge
    message containing my Handle and a nonce, so that I know what I am signing.
43. As a User linking a wallet, I want to sign the challenge with
    `signMessage`, so that the backend can verify I own the wallet.
44. As a User linking a wallet, I want the backend to verify my signature and
    store my `owner_address`, so that my wallet is linked to my Profile.
45. As a User who linked the wrong wallet (before on-chain registration), I
    want to re-link a different wallet via the same flow, so that I can
    correct my mistake.
46. As a User who has already registered on-chain, I want re-linking to be
    blocked with a clear message, so that I understand the on-chain owner is
    immutable.
47. As a User whose wallet cannot sign messages (e.g. WalletConnect-based
    wallet), I want a clear error message, so that I know to reconnect with a
    message-signing-capable wallet like Freighter.
48. As a User who has linked a wallet, I want to enter a Payout Address, so
    that donations are sent to the right address.
49. As a User entering a Payout Address, I want a warning if the address equals
    the contract address or the Treasury, so that I do not strand funds
    (ADR-0004).
50. As a User ready to register on-chain, I want the client to build the
    `register_creator(handle_hash, payout_address)` transaction, so that I can
    sign and submit it.
51. As a User registering on-chain, I want my wallet to sign and submit the
    transaction directly to Soroban RPC, so that the registration is
    self-custodial.
52. As a User who submitted `register_creator`, I want to see a "registration
    pending" state, so that I know the transaction is being processed.
53. As a User waiting for registration, I want the dashboard to subscribe to
    Supabase Realtime on my Profile row and flip to "active" when
    `onchain_registered` becomes true, so that I do not have to manually
    refresh.
54. As a User whose on-chain registration is confirmed, I want all dashboard
    Creator features to unlock, so that I can manage my Creator presence.
55. As a User who claimed a Handle but never registered on-chain within 7 days,
    I want my Handle reservation to be released, so that the Handle is not
    locked forever.

### Creator dashboard (active)

56. As a Creator, I want to see my donation stats (total received, count, recent
    donations) in the `/dashboard` Creator tab, so that I can track my
    performance.
57. As a Creator, I want to see my per-creator leaderboard, so that I can
    identify my top Donors.
58. As a Creator, I want to update my Payout Address by signing an
    `update_creator_payout` transaction, so that I can redirect my funds.
59. As a Creator, I want to see a "payout update pending" state after
    submitting, so that I know the indexer will mirror the change.
60. As a Creator, I want to self-pause by signing a `set_creator_active_owner`
    transaction, so that I can temporarily stop receiving donations.
61. As a Creator, I want to self-unpause by signing the same transaction with
    `active = true`, so that I can resume receiving donations.
62. As a Creator, I want to see my paused/active status reflected in the
    dashboard, so that I know my current state.
63. As a Creator, I want to edit my `display_name`, `avatar_url`, and `bio` in
    the `/dashboard` Creator tab, so that my public profile is up to date.
64. As a Creator, I want to upload an avatar to Supabase Storage, so that my
    avatar is displayed on `/creator/[handle]` and `/creator/explore`.
65. As a Creator, I want to see my Overlay URL (`/overlay/[handle]`) and copy
    it, so that I can add it to OBS.
66. As a Creator, I want to configure Overlay settings (theme, alert duration),
    so that the Overlay matches my stream aesthetic.
67. As a Creator, I want to moderate incoming donations (set Moderation Status
    to `visible` or `hidden`), so that I can control what appears on my
    Overlay.
68. As a Creator, I want hidden donations to not appear on the Overlay, so that
    inappropriate messages are suppressed.
69. As a Creator, I want to see my on-chain registration status, owner address,
    and payout address in the dashboard, so that I can verify my setup.

### Overlay

70. As a Creator, I want to open `/overlay/[handle]` in OBS as a browser
    source, so that donation alerts appear on my livestream.
71. As a Creator, I want the Overlay to subscribe to Supabase Realtime and show
    new confirmed/indexed donations in real time, so that my stream reacts
    instantly.
72. As a Creator, I want the Overlay to only show donations with
    `moderation_status = visible`, so that hidden messages do not appear.
73. As a Viewer, I want to see the Donor Name, amount (with token symbol), and
    message on the Overlay, so that the alert is informative.

### Indexer

74. As the system, I want the indexer poll job to scan all DonationRouter
    events from a single shared cursor, so that no events are missed.
75. As the system, I want the indexer to upsert `DonationReceived` events by
    `tx_hash`, so that donations are not duplicated.
76. As the system, I want the indexer to flip `onchain_registered = true` on
    `CreatorRegistered` events, so that Creators are marked active.
77. As the system, I want the indexer to mirror `payout_address` on
    `CreatorPayoutUpdated` events, so that the off-chain record matches
    on-chain state.
78. As the system, I want the indexer to mirror `paused` on
    `CreatorActiveChanged` events, so that the off-chain record matches
    on-chain state.
79. As the system, I want the indexer to insert/delete `tokens` rows on
    `TokenAllowlistUpdated` events, so that the token picker reflects the
    on-chain allowlist.
80. As the system, I want the indexer to query the SAC contract once for
    `symbol()`, `name()`, `decimals()` when inserting a token, so that the
    token metadata is cached in Postgres.
81. As the system, I want the indexer to be idempotent, so that re-processing
    the same event does not corrupt state.
82. As the system, I want the indexer to handle orphan `CreatorRegistered`
    events (no matching Profile) gracefully, so that it does not crash.
83. As the system, I want the indexer cursor to be persisted in
    `indexer_state`, so that it resumes from the last processed ledger.

### API contracts

84. As a Client, I want `POST /api/creators` to accept a Handle and create a
    Profile reservation, so that I can claim a Handle.
85. As a Client, I want `POST /api/creators` to reject a Handle that is already
    reserved off-chain or registered on-chain, so that conflicts are caught
    early.
86. As a Client, I want `GET /api/creators/[handle]` to return a Creator's
    public profile, so that I can render `/creator/[handle]`.
87. As a Client, I want `POST /api/wallet/link/challenge` to return a
    human-readable challenge string, so that I can display it for signing.
88. As a Client, I want `POST /api/wallet/link` to accept an address + signed
    message and return the verified `owner_address`, so that I can complete
    the wallet link.
89. As a Client, I want `POST /api/wallet/link` to reject a re-link after
    on-chain registration, so that the immutability constraint is enforced.
90. As a Client, I want `POST /api/donations/prepare` to accept handle, token,
    amount, message, donor_name and return `donation_id`, `donation_id_hash`,
    `contract_id`, `handle_hash`, `token_allowlist`, so that I can build the
    donate transaction.
91. As a Client, I want `POST /api/donations/prepare` to store `user_id` if a
    session is present, so that logged-in donations are tracked.
92. As a Client, I want `POST /api/donations/confirm` to accept `tx_hash` +
    `donation_id` and verify the transaction on-chain, so that the donation is
    confirmed.
93. As a Client, I want `POST /api/donations/confirm` to extract
    `donor_address` from the transaction source, so that the donation record
    has the donor's wallet address.
94. As a Client, I want `POST /api/indexer/poll` to scan events and mirror
    state, so that the indexer runs as a cron job.
95. As a Client, I want all mutation API routes to be rate-limited by IP, so
    that abuse is mitigated.

### Docs

96. As a Visitor, I want to visit `/docs` and see a placeholder page, so that
    there is a home for documentation in the future.

## Implementation Decisions

### Route structure (revised from scaffold)

The scaffold's `(auth)/dashboard/{profile,wallet,payout,overlay,donations}`
sub-routes and `(auth)/onboarding` are collapsed. The final route structure:

- `/` — landing (existing, unchanged).
- `/login` — magic link login page (public).
- `/creator/explore` — public browse creators + global leaderboard.
- `/creator/[handle]` — public creator page: profile, stats, per-creator
  leaderboard, donate CTA.
- `/creator/[handle]/donate` — public donate form: token picker, wallet
  connect, message, amount.
- `/dashboard` — authed, tabbed: Donor tab (history, rank, edit display name +
  avatar) and Creator tab (onboarding inline, stats, leaderboard, wallet link,
  payout, overlay, moderation). Creator-specific sections are gated by
  onboarding state and render only when the User has a Handle.
- `/overlay/[handle]` — public OBS browser source (Realtime subscription).
- `/docs` — static placeholder.

The `(auth)` route group is retained for `/dashboard`. The middleware matcher
is updated to redirect unauthenticated `/dashboard` requests to `/login`.
Public routes (`/creator/*`, `/overlay/*`, `/docs`, `/login`) are not gated by
the auth middleware.

### Supabase schema

**`profiles` table** (replaces the scaffold's implied `creators` table):

```
id              uuid PK, default gen_random_uuid()
user_id         uuid, FK auth.users(id), UNIQUE, NOT NULL
display_name    text, NOT NULL, default 'Anonymous'
avatar_url      text, nullable
bio             text, nullable
handle          text, nullable, UNIQUE
handle_hash     bytea, nullable
owner_address   text, nullable
wallet_link_nonce           text, nullable
wallet_link_nonce_expires_at timestamptz, nullable
payout_address  text, nullable
onchain_registered        bool, NOT NULL, default false
paused         bool, NOT NULL, default false
created_at      timestamptz, NOT NULL, default now()
onchain_registered_at     timestamptz, nullable
```

- `handle_hash` is `bytea` (32 bytes raw), not text hex. Compared with `=`,
  indexable.
- A trigger on `auth.users` INSERT autocreates a `profiles` row with
  `display_name = 'Anonymous'`, all Creator fields NULL.
- RLS: owner (`auth.uid() = profiles.user_id`) can SELECT all columns of their
  row and UPDATE only `display_name`, `avatar_url`, `bio`,
  `wallet_link_nonce`, `wallet_link_nonce_expires_at`. Public can SELECT
  `handle`, `display_name`, `avatar_url`, `bio`, `onchain_registered` only for
  rows where `onchain_registered = true AND paused = false`. All other columns
  (`owner_address`, `payout_address`, `user_id`, nonces) are owner-only.
  INSERT/DELETE denied to clients (service role only).

**`donations` table**:

```
id                  uuid PK, default gen_random_uuid()
donation_id_hash    bytea, NOT NULL   -- sha256(id::text)
tx_hash             text, UNIQUE, nullable
creator_profile_id  uuid, FK profiles(id), NOT NULL
handle_hash         bytea, NOT NULL   -- denormalized for indexer match
token               text, NOT NULL    -- SAC contract address
amount              numeric, NOT NULL -- raw i128 as numeric
message             text, nullable
donor_name          text, NOT NULL, default 'Anonymous'
donor_address       text, nullable    -- extracted from tx source at confirm
user_id             uuid, FK auth.users(id), nullable
status              text, NOT NULL, default 'pending'  -- pending|confirmed|indexed
moderation_status   text, NOT NULL, default 'visible'  -- visible|hidden
created_at          timestamptz, NOT NULL, default now()
confirmed_at        timestamptz, nullable
indexed_at          timestamptz, nullable
```

- `donation_id = id` (one column, no separate `donation_id`).
- `handle_hash` denormalized so the indexer can match events without a join.
- RLS: public can SELECT `donor_name`, `amount`, `token`, `message`,
  `created_at`, `creator_profile_id` for rows where
  `status IN ('confirmed','indexed') AND moderation_status = 'visible'`.
  Creator (`auth.uid() = profiles.user_id` via join on `creator_profile_id`)
  can SELECT all columns of their received donations including hidden.
  Donor (`auth.uid() = donations.user_id`) can SELECT all columns of their own
  donations. INSERT/UPDATE/DELETE denied to clients (service role only),
  except: Creator can UPDATE `moderation_status` on donations where they are
  the creator (via join).

**`tokens` table**:

```
contract_address    text PK
symbol              text, NOT NULL
name                text, nullable
issuer              text, nullable
decimals            int, NOT NULL
icon_url            text, nullable
created_at          timestamptz, NOT NULL, default now()
```

- RLS: public SELECT (donor needs to see token picker). INSERT/UPDATE/DELETE
  service role only (indexer).

**`indexer_state` table**:

```
id              int PK, default 1  -- single row
last_ledger     int, NOT NULL
last_cursor     text, nullable
updated_at      timestamptz, NOT NULL, default now()
```

- RLS: no client access (service role only).

**Cron job**: a Supabase cron (`pg_cron`) job runs daily and deletes
`profiles` rows where `onchain_registered = false AND created_at < now() -
interval '7 days' AND handle IS NOT NULL`, releasing the Handle reservation.

### Supabase Auth

- Magic link only (no OAuth providers for MVP). `signInWithOtp({ email,
  options: { emailRedirectTo: /auth/callback?next=... } })`.
- `/auth/callback` route handler exchanges the code for a session, then
  redirects per the logic: if `next` present and not `/login`, redirect to
  `next`; otherwise redirect to `/dashboard`.
- The middleware `updateSession` is updated: the `isAuthRoute` check covers
  `/dashboard` only (not `/onboarding`, which no longer exists as a separate
  route). Public routes (`/creator/*`, `/overlay/*`, `/docs`, `/login`) are
  not gated.

### Wallet link

- Stellar Wallets Kit V2 is installed from JSR
  (`@creit-tech/stellar-wallets-kit`). Initialized with `defaultModules()`
  (Freighter primary).
- `POST /api/wallet/link/challenge` (authed):
  - Load the caller's Profile. If `owner_address IS NOT NULL`, return 409
    "already linked" (unless `onchain_registered = false`, in which case
    re-link is allowed).
  - Generate a 32-byte random nonce (hex). Store `wallet_link_nonce` and
    `wallet_link_nonce_expires_at = now() + 10 minutes` on the Profile row
    (service role write, since RLS allows owner to write nonce but the
    challenge endpoint uses the server client which has the user's session).
  - Return `{ challenge: "StarTip wallet link\nHandle: <handle>\nProfile:
    <handle_hash_hex>\nNonce: <nonce_hex>" }`.
- `POST /api/wallet/link` (authed), body `{ address: string, signedMessage:
  string }`:
  - Reconstruct the challenge string from the Profile row (handle,
    handle_hash, nonce).
  - Verify `Keypair.fromPublicKey(address).verifyMessage(challenge,
    Buffer.from(signedMessage, 'hex'))` (SEP-53: prefix
    `Stellar Signed Message:\n` + SHA256, handled by the SDK).
  - Check `wallet_link_nonce_expires_at > now()`.
  - Check `owner_address IS NULL` OR `onchain_registered = false` (re-link
    allowed pre-registration).
  - If the kit returned `signerAddress` and it differs from `address`, reject.
  - Write `owner_address = address`, null `wallet_link_nonce` and
    `wallet_link_nonce_expires_at` (service role).
  - Return `{ owner_address: address }`.
  - On signature invalid / nonce missing or expired: 400. On already linked
    post-registration: 409.

### Creator onboarding (client-side transaction building)

- The client uses `lib/stellar/client.ts` (`getRpc()`, `contractId`,
  `networkPassphrase`) to build Soroban transactions.
- `register_creator(handle_hash, payout_address)`: client builds the
  transaction, wallet signs via `kit.signTransaction(xdr, { address })`,
  client submits via `rpc.sendTransaction()`.
- After submission, the dashboard subscribes to Supabase Realtime on the
  user's `profiles` row (`postgres_changes` filter on `onchain_registered`).
  The UI shows "registration pending" until `onchain_registered` flips to
  `true` (driven by the indexer).
- `update_creator_payout` and `set_creator_active_owner` follow the same
  pattern: client builds, signs, submits, waits for Realtime flip on
  `payout_address` / `paused`.

### Donate flow

- `POST /api/donations/prepare` (no auth required, rate-limited by IP):
  - Body: `{ handle, token, amount, message, donor_name }`.
  - Validate `handle` exists in `profiles` with `onchain_registered = true AND
    paused = false`. If not, 404 / 409.
  - Validate `token` is in the on-chain allowlist (read from `tokens` table).
    If not, 400.
  - If session present, load `user_id` from session. `donor_name` from
    Profile `display_name` if set and non-default, else from body. If no
    session, `user_id = NULL`, `donor_name` from body (default "Anonymous").
  - Insert `donations` row: `id = gen_random_uuid()`,
    `donation_id_hash = sha256(id::text)`, `status = 'pending'`,
    `creator_profile_id`, `handle_hash`, `token`, `amount`, `message`,
    `donor_name`, `user_id` (nullable).
  - Return `{ donation_id, donation_id_hash, contract_id, handle_hash,
    token_allowlist }` (token_allowlist from `tokens` table).
- Client builds `donate(donor_address, handle_hash, token, amount,
  donation_id_hash)` transaction, wallet signs, client submits to RPC.
- `POST /api/donations/confirm` (no auth required, rate-limited by IP):
  - Body: `{ tx_hash, donation_id }`.
  - Fetch tx from RPC by `tx_hash`. Verify it succeeded. Extract
    `DonationReceived` event. Verify `event.donation_id_hash ==
    sha256(donation_id)`.
  - Extract `donor_address` from the tx source account.
  - Upsert by `tx_hash`: set `status = 'confirmed'`, `confirmed_at = now()`,
    `donor_address`. If the row was `indexed` (indexer got there first),
    promote to `confirmed`.
  - Return `{ status: 'confirmed' }`.

### Indexer

- `POST /api/indexer/poll` (called by Vercel Cron or external scheduler at
  ~5-10s interval):
  - Load `indexer_state` (single row). Call `rpc.getEvents({ contractId,
    startLedger: last_ledger, cursor: last_cursor })`.
  - For each event, dispatch by topic name:
    - `DonationReceived`: upsert `donations` by `tx_hash` (matching on
      `donation_id_hash` to find the pending row, or insert if not found).
      Set `status = 'indexed'`, `indexed_at = now()`.
    - `CreatorRegistered`: find Profile by `handle_hash =
      event.creator_id_hash`. If found and `event.owner == owner_address`,
      set `onchain_registered = true`, `onchain_registered_at = now()`,
      `payout_address = event.payout_address`. If no matching Profile, log
      and skip (orphan).
    - `CreatorPayoutUpdated`: find Profile by `handle_hash`. Set
      `payout_address = event.new_payout_address`.
    - `CreatorActiveChanged`: find Profile by `handle_hash`. Set
      `paused = NOT event.active`.
    - `TokenAllowlistUpdated`: if `added = true`, query the SAC contract for
      `symbol()`, `name()`, `decimals()` (and `issuer` if available), upsert
      `tokens` row by `contract_address`. If `added = false`, delete the
      `tokens` row.
  - Update `indexer_state`: `last_ledger` + `last_cursor` from the last
    processed event. Persist atomically.
  - Idempotency: all operations are upserts or same-value updates. Re-processing
    the same event converges to the same state.

### Avatar storage

- Supabase Storage bucket `avatars` (public read, owner write via RLS:
  `auth.uid() = profiles.user_id`). Both Creator and Donor upload to the same
  bucket. The `avatar_url` stored on `profiles` is the public URL of the
  uploaded object.

### Overlay

- `/overlay/[handle]` is a public route that uses `lib/supabase/client.ts`
  (`createBrowserClient` with anon key) to subscribe to Supabase Realtime on
  the `donations` table filtered by `creator_profile_id` and
  `status IN ('confirmed','indexed') AND moderation_status = 'visible'`.
- Renders donation alerts (Donor Name, amount + token symbol, message) with
  animation. Overlay settings (theme, alert duration) are stored on a
  future `overlay_settings` table (out of scope for this PRD, see Out of
  Scope).

### Token picker

- The donate page fetches the token list from the `tokens` table (via
  `/api/donations/prepare` response or a dedicated `GET /api/tokens` route).
  Renders symbol + name + icon. Amount input uses `decimals` to convert
  between display and raw `i128`.

### Dependencies to install

- `@creit-tech/stellar-wallets-kit` (from JSR) — wallet connection +
  `signMessage` + `signTransaction`.
- `@supabase/supabase-js` — already installed (for service role client in
  route handlers).
- No new UI animation libraries (Framer Motion + Lenis already installed for
  landing).

### Env additions

No new env vars required beyond the existing scaffold
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`).

## Testing Decisions

### What makes a good test

Tests assert on external behavior (HTTP status, JSON body, rendered text,
side-effect mock calls), never on implementation details (internal function
names, private state, Tailwind classes, component internals). A good test
survives a refactor that preserves the external contract.

### Seams

1. **Vitest (unit/integration)** — the primary seam for API route handler
   contracts and lib module behavior. Each route handler is a pure function
   (HTTP request in, HTTP response out). Supabase (`@supabase/ssr`,
   `@supabase/supabase-js`) and Stellar SDK (`@stellar/stellar-sdk`) are
   mocked. Tests assert on status code, JSON body, and mock call arguments
   (side effects). Prior art: `src/app/api/routes.test.ts` (imports route
   handlers, asserts HTTP contract), `src/lib/supabase/middleware.test.ts`
   (mocks `createServerClient`, asserts redirect behavior),
   `src/lib/supabase/server.test.ts` (mocks `next/headers` cookies).

2. **Playwright E2E** — the primary seam for user-facing flows. Boots
   `next dev`, asserts on rendered text, link targets, form interactions, and
   computed styles. Wallet interactions (`signMessage`,
   `signTransaction`) are stubbed via a test wallet provider injected into the
   page context. Supabase Auth is stubbed or pointed at a local Supabase
   stack. Prior art: `tests/landing.spec.ts` (asserts on hero text, CTAs,
   theme, motion accessibility).

3. **Supabase migrations + RLS** — tested via the local Supabase stack
   (`supabase db reset` + `supabase test` or equivalent SQL test queries).
   This is Supabase-native, not a new test framework. RLS policies are tested
   by executing queries as different roles (anon, authenticated user A,
   authenticated user B) and asserting row visibility.

### Modules to be tested

- API route handlers: `/api/creators` (POST), `/api/creators/[handle]` (GET),
  `/api/wallet/link/challenge` (POST), `/api/wallet/link` (POST),
  `/api/donations/prepare` (POST), `/api/donations/confirm` (POST),
  `/api/indexer/poll` (POST).
- Lib modules: `lib/supabase/middleware` (updated matcher), `lib/stellar/*`
  (signature verification helper if extracted).
- Pages: `/login`, `/dashboard` (tab rendering, onboarding gating),
  `/creator/explore`, `/creator/[handle]`, `/creator/[handle]/donate`,
  `/overlay/[handle]`.
- Supabase schema: `profiles` RLS, `donations` RLS, `tokens` RLS,
  `indexer_state` access, autocreate trigger, cron job.

## Out of Scope

- **Google OAuth or other OAuth providers**: magic link only for MVP.
  Adding OAuth is a post-MVP enhancement.
- **SEP-0010 (Stellar Web Authentication)**: rejected as primary login per
  ADR-0002. Remains a future option for replacing the `signMessage` link step.
- **Wallet link recovery after on-chain registration**: if a Creator loses
  their wallet after `onchain_registered = true`, there is no recovery path
  (on-chain owner is immutable). Post-MVP concern.
- **`overlay_settings` table and Overlay theme configuration UI**: the Overlay
  route renders donations but theme customization (colors, alert duration,
  sound) is a separate feature.
- **Donation goal**: a Creator setting a fundraising target with progress bar.
  Post-MVP.
- **Per-stream leaderboards / streams table**: ADR-0001 explicitly defers the
  `streams` table. Leaderboards are global and per-Creator only.
- **Admin dashboard UI**: Admin operations (fee, treasury, pause, token
  allowlist) run via the `stellar` CLI, not the web app.
- **Fee sponsoring / gasless transactions**: donors pay their own gas. No
  fee-sponsored client or relayer.
- **Mobile-native app**: web-only, responsive design.
- **Email templates customization**: Supabase default magic link email
  template is used as-is.
- **Rate limiting implementation details**: the prepare/confirm endpoints are
  rate-limited by IP, but the specific mechanism (Upstash, Vercel KV, in-memory)
  is an implementation detail not fixed by this PRD.
- **Indexer scheduling mechanism**: Vercel Cron, external scheduler, or
  self-scheduling edge function are all acceptable. The contract is the
  `/api/indexer/poll` endpoint + `indexer_state` cursor.

## Further Notes

- This PRD revises the route structure locked by the `web-landing-page` PRD
  (issue 03). The `(auth)/onboarding` route and the six
  `(auth)/dashboard/*` sub-routes are replaced by a single `/dashboard` with
  inline onboarding and tabbed sections. The existing scaffold tests
  (`auth.test.tsx`, `routes.test.ts`) will need to be updated to match the
  new route shape.
- ADR-0002 has been updated during the grilling session to reflect that Donor
  auth is optional (not "never"). ADR-0003 has been extended to cover Creator
  lifecycle events and `TokenAllowlistUpdated` as indexer-only event types
  with a shared cursor.
- `CONTEXT.md` has been updated with the revised domain model: `Profile`
  (glossary term, merged Creator + Donor profile), `Owner Address`
  (immutability after registration), `Wallet Link Challenge`, `Donor Name`,
  `Leaderboard`, `Token Metadata`, `Onboarding State`, `On-chain Creator`.
- The `signMessage` wallet constraint (ADR-0002) applies to the wallet-link
  step only: WalletConnect-based wallets cannot sign messages. Freighter is
  the documented primary wallet. The donate flow uses `signTransaction`,
  which all modules support, so this constraint does not affect donors.
- The indexer must handle the case where `getEvents` returns events for a
  ledger range that overlaps with the previous poll (if the cursor was not
  advanced). Idempotency via upsert/same-value update ensures this is safe.
- The `donations.amount` column is `numeric` (not `bigint`) because Postgres
  `numeric` can hold arbitrary precision and the on-chain `i128` may exceed
  JS `Number.MAX_SAFE_INTEGER` for low-decimals tokens. The UI converts using
  `decimals` from the `tokens` table.
