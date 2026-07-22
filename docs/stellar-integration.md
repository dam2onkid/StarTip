# Stellar Integration Strategy

Last updated: 2026-07-21

## Purpose

This document defines how StarTip uses Stellar, which integrations belong in
each product stage, and which security boundaries must not be weakened. It is a
technical strategy, not a promise that every Stellar feature will be integrated.

## Core architecture

```text
Mobile donor
  -> Supabase session
  -> Passkey-backed C-account authorization
  -> StarTip Hono Sponsor and Relayer
  -> DonationRouter on Soroban
       -> Platform fee to Treasury
       -> Net amount to Creator Payout Address
       -> DonationReceived event
  -> Stellar RPC event ingestor
  -> Supabase
       -> OBS overlay
       -> Dashboard
       -> Future webhook API

Browser donor
  -> Stellar Wallets Kit G-account signing
  -> DonationRouter
  -> Same event and product pipeline
```

The mobile passkey path and browser wallet path share DonationRouter and the
event pipeline. They use different authorization and submission boundaries.

## Integration priorities

### Required for v0.3.0

- Soroban DonationRouter.
- Stellar Asset Contract for one stablecoin-like test asset.
- Passkey-backed C-account.
- Sponsored transaction submission.
- Stellar RPC simulation, submission, confirmation, and event ingestion.
- Existing OBS realtime pipeline.
- Stellar Wallets Kit as the browser fallback.

### Required before mainnet v1.0

- Reviewed smart-account implementation and recovery design.
- Production Sponsor controls and monitoring.
- Verified contract source, metadata, interface, TTL, and upgrade procedures.
- Reliable historical event ingestion and reconciliation.
- `stellar.toml` service discovery.
- One verified mainnet stablecoin.

### Later integrations

- SEP-10 and SEP-45 service authentication.
- SEP-24 or SEP-6 anchor deposit and withdrawal.
- SEP-12 customer information exchange when required by a partner.
- SEP-31 and SEP-38 cross-border payment and quote flows.
- Stellar path payments.
- Sponsored reserves for classic accounts.
- Payment Intent API, webhooks, widgets, and SDKs.
- Agentic payments through x402 or MPP.

## 1. Soroban DonationRouter

DonationRouter is the financial settlement boundary. It should remain small and
auditable.

Responsibilities:

- Register a Creator ID Hash with an Owner Address and Payout Address.
- Require the donor's authorization for `donate`.
- Accept only assets in the Token Allowlist.
- Validate creator availability and donation amount.
- Split the Platform Fee and creator net amount atomically.
- Emit `DonationReceived` with the settlement details required by the indexer.
- Support admin pause, creator pause, fee, treasury, and allowlist controls.

Not responsibilities:

- Donor display name or message.
- Moderation.
- Overlay rendering.
- Donation history arrays.
- Leaderboards or analytics.
- Fiat conversion.

The current contract uses generic Soroban `Address` values, so `C...` and `G...`
addresses can participate without separate donation functions.

The current `DonationReceived` event does not include the donor address. If a
future product view needs to show or analyze the donor C-account, add that field
deliberately to the event and indexer after making a privacy decision. It must
not be inferred from the Sponsor address.

## 2. Passkey-backed C-account

The C-account is the mobile donor's Stellar identity. It holds assets and
authorizes contract calls through `__check_auth`. Stellar supports the P-256
curve used by WebAuthn passkeys, allowing biometric approval without exposing a
seed phrase. See the [Stellar smart-wallet guide](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets).

### v0.3.0 implementation pin

The hackathon prototype is pinned to:

- Implementation: `kalepail/passkey-kit` testnet smart wallet.
- Source commit: `50981ccd5d2de654cf0e50633919cc9ba2df4e58`.
- Testnet v1 WASM hash:
  `fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0`.
- Mobile bridge: `react-native-passkeys@0.4.1`.
- Signature model: `Signatures(Map<SignerKey, Signature>)` with
  `SignerKey::Secp256r1` and `Signature::Secp256r1`.
- Worker encoding source: `apps/worker/src/passkey-wallet-abi.ts` on `feat/expo`.

The public key is signer input, not a Stellar address. The deployed contract
instance produces the `C...` address.

### Required verification

The Worker must verify:

- Credential ID matches the active private wallet binding.
- P-256 public key and signature are canonical.
- Challenge matches the exact Soroban authorization preimage.
- RP ID hash matches the configured RP ID.
- Origin is in the configured allowlist.
- User presence and user verification flags are present.
- Authorization entry, nonce, ledger validity, function, contract, token,
  amount, and recipient match server-prepared state.

The wallet contract verifies the on-chain signature. Worker verification is
still required because the pinned testnet implementation does not enforce every
WebAuthn policy StarTip needs.

### Production decision

The pinned Passkey Kit build is a hackathon testnet dependency, not an automatic
mainnet choice. Before mainnet:

- Review the exact source and deployed executable.
- Obtain an independent security review.
- Evaluate OpenZeppelin Smart Account Kit for policy limits and recovery.
- Define signer addition, replacement, revocation, and multi-device behavior.
- Define account upgrade and emergency recovery procedures.

Do not mix Passkey Kit and Smart Account Kit proof formats. Their authorization
ABIs are not interchangeable.

### Smart-wallet evolution

StarTip should evolve the C-account as a payment guard, in this order:

1. **Policy guard:** enforce per-tip and periodic spending limits, approved
   SAC assets, approved Creator recipients, and an authorization scope limited
   to DonationRouter.
2. **Session authorization:** allow a short-lived delegated signer for repeated
   donations during a stream. Its authority must be bounded by Creator, asset,
   amount, expiry, and revocation.
3. **Recovery and signer management:** support passkey addition, replacement,
   revocation, and a recovery path with a delay and explicit notification.
4. **Risk-based multisig:** require stronger approval for large donations or
   sensitive account changes while keeping a single passkey approval for normal
   tips.
5. **Recurring and delegated payments:** permit an off-chain scheduler or
   agent only through a narrowly scoped, cancellable authorization. It must
   never receive general control of a donor account.

The policy belongs in the smart wallet's `__check_auth` authorization logic.
The Sponsor remains a fee payer and relayer, not a signer with permission to
move donor assets. Use a reviewed, production-ready smart-account framework
before enabling any feature that can retain meaningful value.

## 3. Sponsor and Relayer

The Sponsor is a dedicated `G...` account controlled only by the Worker. It
provides the transaction source, sequence number, fee, envelope signature, and
submission. The donor C-account provides authorization for the DonationRouter
invocation.

The current StarTip flow is:

```text
POST /wallets/deploy
  -> verify Supabase JWT and passkey registration inputs
  -> deploy pinned C-account
  -> persist private wallet binding

POST /donations/prepare
  -> load wallet from JWT subject
  -> resolve creator and allowed asset
  -> validate amount cap and payout address
  -> simulate DonationRouter.donate
  -> store exact authorization entry and single-use prepare ID

POST /donations/submit
  -> load server-prepared state
  -> verify WebAuthn assertion
  -> verify nonce and ledger validity
  -> consume preparation atomically
  -> attach the matching authorization entry
  -> Sponsor signs and submits the envelope
```

### Non-negotiable boundaries

- Mobile never receives the Sponsor secret.
- Worker never accepts arbitrary transaction XDR from mobile.
- Client inputs never select an arbitrary contract or function.
- Each preparation is bound to one user, wallet, asset, amount, creator,
  payout, nonce, authorization entry, and expiry.
- Preparation consumption is atomic and single-use.
- Rate limits are durable and enforced per user and IP.
- Sponsor balance, spending, errors, and request IDs are monitored.

### Production infrastructure

The custom Hono relayer is appropriate for proving StarTip's exact flow. Before
mainnet, compare it with [OpenZeppelin Relayer](https://developers.stellar.org/docs/tools/openzeppelin-relayer),
which Stellar documents as managed Soroban submission infrastructure with fee
management and parallel processing. Retain StarTip's intent allowlist and
WebAuthn verification even if transaction submission moves to a managed relayer.

## 4. Fee sponsorship and reserve sponsorship

These are different capabilities.

### Fee sponsorship

The Sponsor pays the transaction fee. This is required for v0.3.0 because it
lets the donor authorize a payment without first acquiring XLM for fees.

### Sponsored reserves

CAP-0033 allows one account to sponsor base reserves for another account's
entries, including account creation, trustlines, signers, data entries, and
claimable balances. This is useful later for classic `G...` onboarding. See
[Stellar sponsored reserves](https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves).

Sponsored reserves are not required for the primary C-account donation path.
They should be added only if StarTip deliberately onboards classic accounts
that need trustlines or other reserve-backed entries.

## 5. Assets and Stellar Asset Contract

StarTip should use established Stellar assets through SAC rather than issuing a
StarTip token.

### Asset policy

- Lead with one verified stablecoin on mainnet.
- Keep XLM as an optional secondary asset.
- Allowlist by exact SAC contract address, not display symbol.
- Verify issuer, asset code, decimals, authorization flags, and network.
- Configure per-asset minimum and maximum sponsored donation amounts.
- Keep human-readable metadata off-chain but derive eligibility from the
  on-chain Token Allowlist.

### C-account and G-account behavior

- A classic `G...` account uses a trustline for non-XLM Stellar assets.
- A `C...` account holds its SAC balance in contract storage and does not need a
  classic trustline.
- Current Stellar Protocol 26 allows a SAC contract call to create a missing
  trustline for a `G...` address, but the address must authorize it and still
  satisfy the base reserve.

See [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract).

### v0.3.0 test asset

Use one deterministic test asset and script its setup. The script must:

- Fund the Sponsor.
- Identify or deploy the SAC.
- Add the SAC address to DonationRouter.
- Seed the donor C-account.
- Print addresses, balances, and transaction hashes.

Do not make the hackathon demo depend on an unreliable public testnet faucet for
the asset.

## 6. RPC, events, and indexing

Use Stellar RPC for current ledger access, simulation, submission, transaction
status, contract state, and contract events.

StarTip must not treat RPC as its historical application database. Event
history is limited, and `getEvents` currently documents a maximum range of
approximately seven days. Persist events into Supabase with a durable cursor,
idempotent event key, retry strategy, and reconciliation job. See
[Stellar RPC](https://developers.stellar.org/docs/data/apis/rpc) and
[`getEvents`](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents).

Required event pipeline properties:

- At-least-once ingestion with exactly-once database effect.
- Unique event identity for deduplication.
- Durable last processed ledger and paging cursor.
- Confirmation and indexer paths may race but must converge on one donation row.
- Overlay starts empty and displays new realtime donations without replaying old alerts.
- Reconciliation detects missed events and mismatched donor, asset, amount, or creator.

Mercury or another Stellar indexer can be evaluated later when StarTip needs a
public query API or deeper contract analytics. The existing Worker remains the
authoritative v0.3.0 ingestion path.

## 7. Browser wallet compatibility

Stellar Wallets Kit remains the browser path for donors and creators who already
have a classic account. It should coexist with the mobile passkey path.

- Mobile default: C-account and passkey.
- Browser default: Stellar Wallets Kit.
- Both paths call the same DonationRouter function.
- Both paths emit the same normalized `DonationReceived` event.
- Product analytics should distinguish onboarding path, not change settlement semantics.

Do not force existing wallet users to migrate into a C-account.

## 8. Stellar ecosystem standards

### Before mainnet

- SEP-1 `stellar.toml` for domain, contract, service, and signing-key discovery.
- Contract metadata and interface documentation.
- Verified source for deployed DonationRouter and smart-account dependencies.

### When exposing partner APIs

- SEP-10 for proving control of a classic `G...` account.
- SEP-45 for proving control of a contract `C...` account.

These standards should complement Supabase user authentication. A User identity,
a G-account proof, and a C-account WebAuthn authorization are distinct concepts.

### When integrating fiat partners

- SEP-24 for hosted interactive deposit and withdrawal.
- SEP-6 for programmatic deposit and withdrawal.
- SEP-12 for KYC information exchange.
- SEP-31 for cross-border payment processing.
- SEP-38 for quotes and exchange rates.

Use an existing verified anchor. StarTip should not become an anchor in the
current roadmap. See the [Stellar Anchor Platform](https://developers.stellar.org/docs/platforms/anchor-platform).

## 9. Path payments and swaps

Path payments could later let a donor send one supported asset while the
creator receives a preferred stablecoin. Stellar can route through SDEX offers
or liquidity pools. See [Stellar path payments](https://developers.stellar.org/docs/build/guides/transactions/path-payments).

This is not a v0.3.0 feature. Before adding it, StarTip needs:

- A reliable quote and route check.
- Strict slippage limits.
- Clear donor confirmation of sent and received amounts.
- Failure handling when no viable route exists.
- Verification that the route composes safely with DonationRouter settlement.

## 10. Claimable balances

Claimable balances can deliver assets to a classic account that is not ready to
receive them and can add time-based claim conditions. They still consume reserve
and a non-XLM recipient still needs a trustline before claiming. See
[Stellar claimable balances](https://developers.stellar.org/docs/build/guides/transactions/claimable-balances).

They are not useful for the primary direct C-account donation flow. Consider
them later only for delayed creator payouts or invitation-based onboarding.

## 11. Agentic payments

After the creator payment flow becomes a stable API, StarTip can explore x402
or MPP for:

- AI agents tipping creators.
- Paid content or API requests.
- Automated royalties and revenue splits.
- Machine-to-machine micropayments.

This belongs in v2.0 and must not distract from proving human QR donations.

## Security checklist before mainnet

- Exact smart-account source commit and deployed WASM verified.
- Smart-account and DonationRouter security review complete.
- `__check_auth` tested directly, not only through mocked authorization.
- Replay, mutation, expiry, and concurrent-submit tests pass.
- Sponsor rate limits, budgets, alerts, and emergency shutdown tested.
- Admin and Treasury use appropriate multisig controls.
- Contract upgrade and TTL procedures documented and rehearsed.
- Token issuer and SAC address verified for the target network.
- Event ingestion and reconciliation recover from downtime.
- Passkey loss, device replacement, and credential revocation have a safe path.
- No private key, Sponsor secret, or credential material appears in logs or mobile config.

## Integration decision rule

Add a Stellar integration only when it does at least one of the following:

- Removes friction from the QR-to-donation flow.
- Improves non-custodial settlement or security.
- Helps a creator receive or use stablecoin value.
- Makes StarTip easier for another creator platform to integrate.
- Produces measurable Stellar usage through real product activity.

Otherwise, keep it out of the active version.
