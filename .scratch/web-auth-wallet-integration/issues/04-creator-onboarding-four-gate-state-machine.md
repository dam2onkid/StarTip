Status: done

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The Creator onboarding vertical slice: a User opts into becoming a Creator,
claims a Handle, links a wallet via `signMessage`, sets a Payout Address, signs
and submits `register_creator` on-chain from the client, and watches the
dashboard flip to "active" via Supabase Realtime when the indexer mirrors the
`CreatorRegistered` event. This is the four-gate state machine (CONTEXT.md
§Onboarding State) rendered inline in the `/dashboard` Creator tab.

Install `@creit-tech/stellar-wallets-kit` from JSR. Initialize with
`defaultModules()` (Freighter primary).

`POST /api/creators` (authed): accept a Handle. Check both the `profiles` table
(unique `handle`) and the on-chain `get_creator(sha256(handle))` before
accepting. If either is taken, reject. On success, store `handle` and
`handle_hash = sha256(handle)` on the caller's Profile (service role write).
Return the Profile's Creator fields.

`POST /api/wallet/link/challenge` (authed): load the caller's Profile. If
`owner_address IS NOT NULL` and `onchain_registered = true`, return 409 "already
linked". Re-link is allowed only while `onchain_registered = false`. Generate a
32-byte random nonce (hex). Store `wallet_link_nonce` and
`wallet_link_nonce_expires_at = now() + 10 minutes` on the Profile (service
role). Return `{ challenge: "StarTip wallet link\nHandle: <handle>\nProfile:
<handle_hash_hex>\nNonce: <nonce_hex>" }`.

`POST /api/wallet/link` (authed), body `{ address, signedMessage }`: reconstruct
the challenge from the Profile row. Verify
`Keypair.fromPublicKey(address).verifyMessage(challenge,
Buffer.from(signedMessage, 'hex'))` (SEP-53 prefix handled by the SDK). Check
`wallet_link_nonce_expires_at > now()`. Check `owner_address IS NULL` OR
`onchain_registered = false`. If the kit returned a `signerAddress` differing
from `address`, reject. Write `owner_address = address`, null the nonce and
expiry (service role). Return `{ owner_address }`. On signature invalid / nonce
missing or expired: 400. On already linked post-registration: 409.

The dashboard Creator tab renders the four-gate state machine inline, each gate
blocking the next:

1. `profile_pending` — no Handle. "Become a Creator" action opens the claim
   Handle form (with availability check against `POST /api/creators`).
2. `wallet_pending` — Handle claimed, no `owner_address`. Prompt to connect a
   Stellar wallet via the kit and sign the challenge (`signMessage`). On
   success, advance.
3. `onchain_pending` — wallet linked, not registered. Prompt for Payout
   Address. Warn if the address equals the contract address or the Treasury
   (ADR-0004: the contract will not reject it, funds would be stranded). Client
   builds `register_creator(handle_hash, payout_address)`, wallet signs via
   `kit.signTransaction(xdr, { address })`, client submits via
   `rpc.sendTransaction()`. Show "registration pending".
4. `active` — `onchain_registered = true`. All Creator features unlock (wired in
   the creator-tab slice; here just confirm the gate opens).

After submission, the dashboard subscribes to Supabase Realtime on the user's
`profiles` row (`postgres_changes` filter on `onchain_registered`) and flips to
"active" when the indexer mirrors the event. No manual refresh.

Re-linking a different wallet is allowed only while `onchain_registered = false`;
once registered, re-link is blocked with a clear message (on-chain owner is
immutable, ADR-0002). A wallet that cannot sign messages (e.g. WalletConnect)
fails the link step with a clear message; reconnect with a message-signing
wallet like Freighter.

Tests: Vitest for all four API routes (`POST /api/creators`,
`POST /api/wallet/link/challenge`, `POST /api/wallet/link`) with mocked Supabase
and Stellar SDK, asserting HTTP contract (status, body), the dual-source Handle
conflict check, nonce generation + expiry, signature verification, re-link
blocking post-registration, and the `signerAddress` mismatch rejection.
Playwright E2E for the onboarding flow with a stubbed test wallet provider
injected into the page context (asserts each gate renders, claim Handle
availability check, wallet link challenge display + sign, payout warning,
register submission, and Realtime flip to active).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `@creit-tech/stellar-wallets-kit` is installed and initialized with
      `defaultModules()` (Freighter primary).
- [ ] `POST /api/creators` checks `profiles` uniqueness AND on-chain
      `get_creator(sha256(handle))`; rejects taken Handles; stores `handle` +
      `handle_hash` on success.
- [ ] `POST /api/wallet/link/challenge` generates a 32-byte nonce with 10-minute
      expiry, returns the human-readable challenge, and 409s when already linked
      post-registration.
- [ ] `POST /api/wallet/link` verifies the `signMessage` signature, checks nonce
      + expiry, enforces re-link-only-pre-registration, rejects `signerAddress`
      mismatch, writes `owner_address`, nulls the nonce.
- [ ] Dashboard Creator tab renders the four-gate state machine inline; each
      gate blocks the next.
- [ ] Claim Handle form shows availability before submitting.
- [ ] Wallet link displays the human-readable challenge and signs via
      `signMessage`.
- [ ] Payout Address entry warns when the address equals the contract address
      or the Treasury.
- [ ] Client builds, signs, and submits `register_creator(handle_hash,
      payout_address)` directly to Soroban RPC; shows "registration pending".
- [ ] Dashboard subscribes to Realtime on the Profile row and flips to "active"
      when `onchain_registered` becomes true.
- [ ] Re-link is blocked after on-chain registration with a clear message.
- [ ] A message-incapable wallet fails the link step with a clear message.
- [ ] Vitest covers the four API route contracts.
- [ ] Playwright covers the end-to-end onboarding flow with a stubbed wallet.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/02-magic-link-login-profile-autocreation.md`
- `.scratch/web-auth-wallet-integration/issues/03-indexer-poll-shared-cursor-all-events.md`
