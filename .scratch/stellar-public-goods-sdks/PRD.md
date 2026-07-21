# Stellar Passkey and Trustline Public-Goods SDKs

Status: ready-for-agent

## Problem Statement

StarTip gives Creators a QR-based Donation experience on Stellar, but a new
Donor still needs a compatible wallet and, for non-native assets, may need to
create a trustline. Those two prerequisites are major abandonment points for a
mobile-first live-payment experience.

The broader Stellar ecosystem has the same gaps. The Passkey UI Kit RFP asks
for reusable, customizable React components and headless APIs for WebAuthn
passkeys plus OpenZeppelin-compatible smart accounts. The Trustline Onboarder
RFP asks for a reusable widget or SDK for one-click, sponsored, multi-asset
trustline onboarding. StarTip should consume both capabilities, but neither
package may be tied to StarTip's Creator, Donation, Supabase, overlay, or
moderation domain.

## Solution

Create two independently versioned, publicly reusable repositories and use
StarTip as their first real consumer:

1. `stellar-passkey-ui`, published as `@stellar/passkey-ui`, provides
   WebAuthn passkey registration, smart-account recovery, transaction signing,
   styled React components, and headless hooks.
2. `stellar-trustline-onboarder`, published as
   `@stellar/trustline-onboarder`, provides asset inspection, trustline plans,
   one-click and batched trustline transactions, and a host-provided
   sponsorship adapter.
3. Each repository includes an `apps/playground` application. The playground
   is an independent consumer that demonstrates the public API, supplies
   deterministic development adapters, and exercises responsive UI states
   without depending on StarTip or its infrastructure.
4. StarTip integrates both packages through narrow adapter contracts. Its
   existing Donation settlement, verification, indexing, and Overlay behavior
   remain unchanged.

### Delivery Stages

- **Phase 0, local scaffold:** create the two private workspace packages with
  their own TypeScript and test configuration. The temporary `@startip/*`
  names exist only to give StarTip a safe staging boundary. This phase does not
  claim that either RFP deliverable, public package, standalone repository, or
  playground has shipped.
- **Phase 1, Trustline Onboarder:** establish the public package identity,
  implement the planner and adapter contracts, add its standalone playground,
  and integrate it into StarTip.
- **Phase 2, Passkey UI Kit:** pin the smart-account ABI and proof contract,
  implement the public passkey contracts and playground, then integrate it
  into StarTip.
- **Phase 3, publication:** move each mature package to its independent public
  repository, add release artifacts and clean-install verification, then submit
  the corresponding RFP. The final npm scope is selected only after package
  name availability and ownership are verified.

## User Stories

1. As a first-time Donor, I want to create a passkey-backed account without
   installing a browser extension, so that I can support a Creator from a QR
   link on my phone.
2. As a returning Donor, I want to recover my passkey-backed account on a new
   device when my authenticator permits it, so that I retain control of my
   funds.
3. As a Donor, I want to see which account will sign a transaction, so that I
   understand who authorizes a Donation.
4. As a Donor, I want a clear success, pending, cancellation, and failure
   state during passkey signing, so that I never think the Donation page is
   frozen.
5. As a Donor, I want to sign a Soroban transaction with a passkey, so that I
   can use an app without managing a seed phrase in the app.
6. As an application developer, I want a headless passkey API, so that I can
   keep my own design system.
7. As an application developer, I want accessible prebuilt passkey components,
   so that I can ship a safe baseline quickly.
8. As an application developer, I want to provide my own RPC, smart-account,
   relayer, and analytics adapters, so that the UI kit does not custody funds
   or impose infrastructure choices.
9. As an application developer, I want typed errors for unsupported WebAuthn,
   cancelled credential prompts, account deployment failures, and signing
   failures, so that I can provide useful recovery guidance.
10. As a Donor, I want to know when a chosen asset needs a trustline, so that I
    understand the prerequisite before I approve a transaction.
11. As a Donor, I want to establish a missing trustline and send my Donation in
    one signing flow when the host app can compose them, so that I avoid
    confusing extra steps.
12. As a Donor, I want to add trustlines for several assets in one flow, so
    that I can onboard for a campaign or wallet setup efficiently.
13. As a Donor, I want the host app to tell me whether it sponsors the required
    fee and reserve, so that costs are explicit before I proceed.
14. As an application developer, I want a sponsor adapter contract, so that I
    can use my own compliance, rate-limit, eligibility, and relayer policy.
15. As an application developer, I want a headless trustline planner and a
    styled widget, so that I can choose UX control appropriate to my app.
16. As an application developer, I want native XLM to bypass trustline setup,
    so that users do not see unnecessary UI.
17. As a StarTip Creator, I want new fans to complete payment with less wallet
    and asset friction, so that more QR scans become Donations.
18. As a StarTip operator, I want both packages to be independently tested and
    versioned, so that public-good releases do not destabilize Donations.
19. As a package maintainer, I want a playground that uses only public exports,
    so that accidental internal API coupling is detected early.
20. As an RFP reviewer, I want to see reusable libraries, documentation,
    example flows, and a real application integration, so that the project is
    demonstrably useful beyond a single demo.

## Implementation Decisions

- Each SDK is a standalone public repository with its own release process,
  issue tracker, documentation, license, security policy, CI, and package
  identity. StarTip stays in its existing repository.
- Each SDK repository uses a small workspace containing the published package,
  `apps/playground`, tests, and documentation. The playground is not a hidden
  StarTip clone and may not import StarTip code.
- The passkey package exposes a stable signer abstraction. Its public boundary
  accepts transaction XDR and returns signed transaction XDR plus signer
  identity. It may not expose seed phrases, private keys, or a custodial
  service.
- The passkey package defines adapters for WebAuthn, smart-account deployment,
  account lookup, transaction preparation, and transaction submission. The
  default React UI composes those adapters but does not embed a production
  relayer URL or an opinionated backend.
- The smart-account implementation must target the OpenZeppelin-compatible
  smart-account standard required by the RFP. The exact deployed wallet ABI,
  proof verification contract, supported network set, and upgrade policy are
  pinned before any production API is published.
- The trustline package represents onboarding as a pure plan: no action,
  establish one trustline, establish a batch, or surface an ineligible/error
  state. Building and signing a transaction are separate from deciding the
  plan.
- The trustline package supports Classic asset `changeTrust` operations,
  native-XLM no-op handling, and an extension point for SAC-aware host flows.
  It must not claim that every Soroban token can be opened by a Classic
  trustline without issuer metadata.
- Sponsorship is explicit and host-owned. A sponsor adapter receives a
  requested plan and returns an eligible sponsored transaction or a typed
  refusal. The SDK does not create a relayer, spend sponsor funds, or bypass
  reserve requirements itself.
- StarTip integrates the passkey package by selecting a signer at the existing
  transaction-signing boundary. It integrates the trustline package by
  replacing only the current trustline decision and transaction-building
  boundary. DonationRouter's settlement API and the verify/indexer contract
  remain stable.
- All asynchronous public UI actions display progress and disable duplicate
  submissions for their full pending duration.
- Package documentation includes threat model, browser support, accessibility
  behavior, account recovery limitations, sponsorship policy responsibilities,
  network configuration, and integration examples.

## Testing Decisions

- Tests assert public behavior and user-observable states, never internal
  component composition or private adapter implementation.
- Passkey package unit tests cover registration, authentication, account
  deployment, transaction signing, cancellation, unsupported browser support,
  and typed failure recovery through deterministic WebAuthn and RPC adapters.
- Trustline package unit tests cover native XLM, an existing trustline, a
  missing trustline, unsupported asset metadata, batched assets, sponsor
  approval, sponsor refusal, and transaction-build failure.
- Each package has component accessibility tests for keyboard use, focus,
  visible labels, live status, disabled pending actions, and error recovery.
- Each playground has end-to-end tests using only the package's public API and
  deterministic adapters. It must demonstrate every documented state,
  including failure and cancellation, without a live wallet.
- StarTip integration tests retain the existing highest seams: donation-flow
  behavior is tested with a signer adapter and trustline adapter, and browser
  tests verify the full QR donation flow through its existing wallet and
  donation stubs.
- Before release, each SDK runs type checks, unit tests, accessibility tests,
  build, package export verification, and a clean-install smoke test in a
  separate consumer project.

## Out of Scope

- A custom smart-account wallet protocol, custom cryptography, seed phrase
  storage, custody, or recovery service.
- A production sponsorship treasury or a universal public relayer.
- KYC, AML, fiat conversion, anchor integration, or local cash-out policy.
- Changing DonationRouter fee splitting, Creator registration, Donation
  verification, indexer behavior, overlay rendering, or Supabase schema except
  where a later approved StarTip integration needs a minimal adapter boundary.
- React Native components in the first release, unless they can be delivered
  without delaying the required React package. The public interfaces must stay
  portable enough to support them later.
- Publishing either repository before package names, licensing, ABI, security
  policy, and README examples have been reviewed.

## Further Notes

- The Trustline Onboarder is the first implementation slice because StarTip
  already has user-facing trustline detection and a one-transaction
  `changeTrust + donate` path. It offers the fastest route to a real reference
  integration.
- The Passkey UI Kit follows after the smart-account ABI and WebAuthn proof
  contract are pinned. It has higher security and interoperability risk, so it
  must not be rushed into a public API.
- The RFP submissions should be separate. Each must describe its own reusable
  deliverables, milestones, test evidence, and StarTip reference integration.
- The current checkout must be treated as authoritative for implementation.
  Any earlier passkey-relayer work must be located and verified before reuse.
