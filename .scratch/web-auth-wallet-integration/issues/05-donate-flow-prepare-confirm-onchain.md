Status: ready-for-agent

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The donate vertical slice: a Donor (anonymous or logged-in) connects a Stellar
wallet on `/creator/[handle]/donate`, picks a token from the on-chain allowlist,
enters an amount + message, and signs + submits `donate()` directly to Soroban
RPC. The page calls `/api/donations/prepare` to create a pending off-chain row,
then posts the tx hash to `/api/donations/confirm` to verify the on-chain
`DonationReceived` event and confirm the donation. ADR-0003 fixes the two-path
contract: confirm is the fast path, the indexer is the reconcile path.

`POST /api/donations/prepare` (no auth required, rate-limited by IP): body
`{ handle, token, amount, message, donor_name }`. Validate `handle` exists in
`profiles` with `onchain_registered = true AND paused = false` (404 / 409 if
not). Validate `token` is in the on-chain allowlist (read from the `tokens`
table; 400 if not). If a session is present, load `user_id` and use the
Profile `display_name` as `donor_name` if set and non-default, else the body
value. If no session, `user_id = NULL` and `donor_name` from the body (default
"Anonymous"). Insert a `donations` row: `id = gen_random_uuid()`,
`donation_id_hash = sha256(id::text)`, `status = 'pending'`, plus
`creator_profile_id`, `handle_hash`, `token`, `amount`, `message`,
`donor_name`, `user_id` (nullable). Return `{ donation_id, donation_id_hash,
contract_id, handle_hash, token_allowlist }` (token_allowlist from `tokens`).

The client builds the `donate(donor_address, handle_hash, token, amount,
donation_id_hash)` transaction using `lib/stellar/client.ts`, the wallet signs
via `kit.signTransaction`, and the client submits to `rpc.sendTransaction()`.
All wallet modules support `signTransaction`, so anonymous donors are not
constrained by the `signMessage` limitation (ADR-0002).

`POST /api/donations/confirm` (no auth required, rate-limited by IP): body
`{ tx_hash, donation_id }`. Fetch the tx from RPC by `tx_hash`. Verify it
succeeded. Extract the `DonationReceived` event. Verify
`event.donation_id_hash == sha256(donation_id)`. Extract `donor_address` from
the tx source account. Upsert by `tx_hash`: set `status = 'confirmed'`,
`confirmed_at = now()`, `donor_address`. If the row was `indexed` (indexer got
there first), promote to `confirmed`. Return `{ status: 'confirmed' }`.

`/creator/[handle]/donate` UI: token picker rendered from the `tokens` table
(symbol, name, icon) with decimals-aware amount conversion (UI converts between
display and raw `i128` using `decimals`). Wallet connect via the kit
(`signTransaction`). Donor name input (default "Anonymous") + message. On
submit: call prepare, build + sign + submit `donate()`, post `tx_hash` +
`donation_id` to confirm. Show a success confirmation after confirm, and a
clear error if the transaction fails (Creator paused, token not allowed,
insufficient balance) by decoding the typed error enum (ADR-0004).

Tests: Vitest for `prepare` and `confirm` with mocked Supabase and Stellar SDK,
asserting the HTTP contract (status, body), validation rejections (unknown
handle, paused creator, disallowed token), `user_id` storage when session
present vs NULL when anonymous, `donation_id_hash` correctness, tx + event
verification, `donor_address` extraction, and `indexed` -> `confirmed`
promotion. Playwright E2E for the donate flow with a stubbed test wallet
(asserts token picker render, amount conversion, prepare -> sign -> submit ->
confirm -> success, and the error path for a paused creator).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `POST /api/donations/prepare` validates handle (registered + not paused),
      token (in allowlist), stores `user_id` when session present else NULL,
      inserts a pending row with `donation_id_hash = sha256(id::text)`, and
      returns the metadata needed to build the donate tx.
- [ ] `POST /api/donations/confirm` fetches the tx, verifies success +
      `DonationReceived`, checks `donation_id_hash`, extracts `donor_address`
      from the tx source, upserts by `tx_hash` as `confirmed`, and promotes
      `indexed` -> `confirmed`.
- [ ] `/creator/[handle]/donate` renders the token picker from `tokens` with
      symbol/name/icon and decimals-aware amount conversion.
- [ ] The page connects a wallet via the kit, calls prepare, builds + signs +
      submits `donate()` to RPC, posts `tx_hash` to confirm, and shows success.
- [ ] A failed transaction (paused creator, disallowed token, insufficient
      balance) surfaces a clear error decoded from the typed error enum.
- [ ] Anonymous donors (no session) donate with `user_id = NULL`; logged-in
      donors have `user_id` stored and `donor_name` from their Profile.
- [ ] Vitest covers `prepare` and `confirm` contracts including validation,
      session handling, hash correctness, and `indexed` -> `confirmed`.
- [ ] Playwright covers the donate flow with a stubbed wallet, including the
      error path.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/03-indexer-poll-shared-cursor-all-events.md`
- `.scratch/web-auth-wallet-integration/issues/04-creator-onboarding-four-gate-state-machine.md`
