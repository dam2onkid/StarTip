# StarTip Product Roadmap

Last updated: 2026-07-21

## Roadmap rules

- The version currently being shipped is the only execution priority.
- A version is complete only when its primary user journey works end to end.
- Mainnet, fiat, cross-chain, and public SDK work must not block v0.3.0.
- New ideas go into a later version unless they remove a blocker from the active release.
- The source of truth for the passkey implementation remains the pinned wallet
  ABI and the authorization design recorded in the project technical documents.
- `docs/specs.md` remains the validated v0.1.0 specification. Its MVP scope is
  historical and does not override the v0.3.0 scope in this document.

## Version overview

### v0.1.0 - Web MVP

Status: released

Goal: prove that a creator can receive a Stellar donation and show it on a
livestream.

Delivered:

- Creator profile, handle, payout address, and self-service on-chain registration.
- Public donation page and QR code.
- Stellar Wallets Kit signing flow.
- DonationRouter fee split and `DonationReceived` event.
- Supabase donation history, moderation, goals, and leaderboards.
- Realtime OBS overlay with alert sound and Text-to-Speech.
- Testnet deployment and public web demo.

### v0.2.0 - Platform foundation

Status: current web baseline

Goal: make the MVP easier to extend without changing the core settlement model.

Scope:

- Monorepo boundaries for web, worker, shared packages, and contracts.
- Hono worker for verification, indexing, and Text-to-Speech.
- Explicit on-chain and off-chain ownership boundaries.
- Hardened donation confirmation and realtime event handling.
- Stable creator, donor, payout, overlay, and token domain terminology.
- Preparatory architecture for passkey accounts and sponsored transactions.

### v0.3.0 - Passkey C-account hackathon release

Status: in progress

Goal: demonstrate one complete donation with no wallet extension, no seed
phrase, and no donor-funded XLM fee.

The release story is:

> A viewer scans a Creator QR, creates or opens a passkey-backed Stellar
> C-account, approves a sponsored stablecoin donation, and sees the donation
> appear on the Creator's OBS overlay.

#### Current foundation

- The web MVP, DonationRouter, indexer, dashboard, and OBS overlay already work.
- The passkey C-account model and sponsored transaction boundary are defined.
- Wallet binding, prepared authorization, replay protection, rate limiting, and
  sponsored Worker routes are part of the current development foundation.
- DonationRouter events identify the C-account donor rather than the Sponsor.
- The remaining work is proving and polishing the complete testnet flow.

#### Required outcomes

- A real passkey controls a real testnet C-account.
- A dedicated Sponsor pays transaction fees without exposing its key.
- The C-account holds and donates one allowed SAC asset.
- DonationRouter splits the fee and creator payout atomically.
- The donation is indexed exactly once and appears on the OBS overlay.
- Replay, mutation, and unauthorized submission attempts are rejected.
- Transaction hashes, screenshots, and a backup demonstration are available.

#### Explicitly not in v0.3.0

- Mainnet deployment.
- Multi-device passkeys or account recovery.
- Production fiat on-ramp or off-ramp.
- Path payments, swaps, bridges, or cross-chain checkout.
- Multiple stablecoins in the primary demo.
- A public SDK or third-party developer portal.
- A custom smart-account contract.

## Seven-day v0.3.0 execution plan

The [v0.3.0 overview](./v0.3.0.md) contains the daily focus and relevant Stellar
technical references.

- [Day 1](./v0.3.0.md#day-1): fund the Sponsor, issue one test asset, deploy its
  SAC, and configure DonationRouter.
- [Day 2](./v0.3.0.md#day-2): create a real passkey, deploy the pinned C-account,
  and seed its SAC balance.
- [Day 3](./v0.3.0.md#day-3): finish auth-entry signing and submit one real
  sponsored DonationRouter donation on testnet.
- [Day 4](./v0.3.0.md#day-4): close the user-visible QR-to-overlay loop and
  verify exactly-once event ingestion.
- [Day 5](./v0.3.0.md#day-5): run replay, mutation, expiry, rate-limit, RPC, and
  direct `__check_auth` failure tests.
- [Day 6](./v0.3.0.md#day-6): polish the single demo path, collect on-chain
  evidence, and record the backup demo.
- [Day 7](./v0.3.0.md#day-7): freeze features, run release validation, rehearse
  the pitch, and identify the exact submission commit.

The required Stellar topics are indexed in the
[v0.3.0 technical reference map](./v0.3.0.md#stellar-technical-reference-map).

## v0.3.0 release gate

Do not call the release complete unless all items below are true:

- A real passkey controls a real Stellar C-account.
- The Sponsor pays the transaction fee without exposing its secret.
- One SAC donation settles through DonationRouter and pays the Creator directly.
- The C-account is recorded as the donor.
- The donation appears exactly once in the database and OBS overlay.
- Core replay and mutation tests fail as designed.
- The flow succeeds at least three consecutive times.
- A transaction hash and backup demo recording are available.

## v0.4.0 - Mainnet readiness and private beta

Goal: turn the hackathon prototype into a safe pilot for a small creator cohort.

Planned scope:

- Replace or formally review the third-party testnet wallet contract before meaningful value is held.
- Evaluate OpenZeppelin Smart Account Kit and Relayer for the production account and sponsorship path.
- Add passkey recovery, credential replacement, and multi-device design.
- Add Sponsor policy monitoring, budgets, alerts, and circuit breakers.
- Publish `stellar.toml`, contract metadata, interface documentation, and verified source.
- Add contract TTL, upgrade, multisig admin, and emergency procedures.
- Add production event ingestion, reconciliation, and long-term history.
- Run a closed testnet pilot with 5 to 10 creators before mainnet.

Release gate:

- Independent security review completed for the smart-account and donation contracts.
- Recovery and Sponsor incident procedures tested.
- At least five creators complete onboarding and receive successful test donations.

## v1.0.0 - Mainnet creator pilot

Goal: settle real stablecoin donations for a controlled creator cohort.

Planned scope:

- Mainnet DonationRouter deployment.
- One verified stablecoin asset.
- Creator web onboarding and payout management.
- Passkey donor onboarding with production sponsorship policies.
- Reliable QR, donation, dashboard, and OBS experience.
- Public status, support, privacy, terms, and incident communication.
- Product analytics for activation, repeat donations, and creator retention.

Success signal:

- Real creators receive repeated donations without StarTip custody.
- Settlement, indexing, and overlay reliability meet the targets in `vision.md`.

## v1.1.0 - Creator growth

Goal: improve creator acquisition and repeat donation behavior.

Candidate scope:

- Creator referral and campaign links.
- Better share cards, QR customization, and overlay themes.
- Donor receipts and donation history.
- Creator analytics for repeat donors and stream performance.
- Localized APAC copy and stablecoin value display.
- Verified regional on-ramp or off-ramp pilot if a compliant partner exists.

## v1.2.0 - Integration platform

Goal: let third-party creator tools reuse the proven payment flow.

Candidate scope:

- Payment Intent API.
- Hosted checkout and embeddable tip button.
- Signed webhooks and idempotent delivery.
- TypeScript SDK and integration examples.
- OBS and streaming-tool plugins.
- Path payments so a donor can pay one supported asset while the creator receives another.

## v2.0.0 - APAC creator payment network

Goal: connect creators, platforms, wallets, and verified payment partners through
a common Stellar settlement layer.

Candidate scope:

- Multiple verified stablecoins and regional payout corridors.
- SEP-compatible anchor integrations for fiat entry and exit.
- Platform-level settlement and revenue-split APIs.
- Agentic and machine-to-machine micropayments for content and services.
- Public ecosystem metrics and reusable open-source payment components.

## Permanent backlog guardrails

The following ideas require a separate product decision and must never enter an
active release by default:

- StarTip token or NFT incentives.
- Creator funds automatically placed into DeFi.
- A proprietary bridge or anchor.
- Arbitrary sponsored contract execution.
- Full social feed, livestream hosting, or creator marketplace.
- On-chain donor messages or personally identifiable data.
