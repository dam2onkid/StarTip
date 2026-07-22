# StarTip Product Vision

Last updated: 2026-07-21

## Purpose

This document is the strategic guardrail for StarTip. Use it to decide what to
build, what to postpone, and what to reject. If a proposed feature does not
strengthen the product promise, the first target user, or the Stellar ecosystem
value described here, it should not enter the active roadmap.

## Vision

StarTip becomes the non-custodial payment rail for live creators in APAC.
Viewers scan a QR code, approve a stablecoin donation with a passkey, and the
creator receives the funds directly while their livestream reacts to a
verifiable on-chain event.

## Product promise

> Scan, approve, and support a creator in seconds. No seed phrase, no wallet
> extension, no XLM fee balance, and no platform custody.

StarTip is not trying to make users learn Stellar. Stellar should be the
invisible settlement and authorization layer that makes the experience fast,
global, transparent, and programmable.

## Initial market

The first target is small and mid-sized livestream creators who:

- Use OBS, TikTok Live, YouTube Live, Twitch, Facebook Gaming, or similar tools.
- Receive support from audiences across countries.
- Need a simple QR link, immediate confirmation, and an engaging live alert.
- Cannot justify high platform fees, payout delays, or a complex crypto setup.

The first donor experience targets mobile viewers. The first creator workflow
can remain web-first because creators perform setup less frequently and already
use a desktop streaming environment.

## Strategic wedge

StarTip enters through one narrow, high-signal workflow:

```text
Creator publishes QR
  -> Donor scans
  -> Donor creates or opens a passkey C-account
  -> Donor approves a sponsored stablecoin donation
  -> DonationRouter settles fee and payout
  -> DonationReceived is indexed
  -> OBS shows the alert
```

The QR-to-overlay loop is the product. The dashboard, analytics, SDKs, anchors,
and additional payment methods support that loop but do not replace it.

## Why StarTip should exist

StarTip combines several capabilities that are usually fragmented:

- Consumer onboarding without seed phrases through a passkey-backed C-account.
- Sponsored transaction fees so the donor does not need XLM before donating.
- Direct stablecoin settlement to the creator without StarTip holding funds.
- An atomic Soroban fee split with an independently verifiable event.
- A realtime OBS experience that turns settlement into visible creator value.
- A future integration layer for streaming tools and creator platforms.

Existing tipping products validate demand. StarTip must differentiate through
the complete consumer experience and its non-custodial settlement architecture,
not by claiming that creator tipping itself is a new category.

## Product principles

### 1. The payment experience must feel like Web2

Prefer QR, passkeys, biometric approval, clear local-currency context, and
human-readable status. Do not expose XDR, trustlines, sequence numbers, contract
addresses, or network terminology in the normal donor journey.

### 2. StarTip must not hold creator funds

DonationRouter transfers the platform fee and creator payout during settlement.
StarTip may sponsor fees and coordinate the transaction, but it must not become
the custodian of donation balances.

### 3. On-chain scope stays narrow

Keep settlement, authorization, asset allowlisting, fee configuration, and
proof events on-chain. Keep donor display names, messages, moderation, themes,
analytics, and OBS presentation off-chain.

### 4. One complete flow is more valuable than many partial integrations

A feature is not complete until it works from user action to on-chain result and
visible product feedback. For v0.3.0, a real passkey donation that appears in
the OBS overlay is more important than supporting more wallets, assets, chains,
or dashboard modules.

### 5. Stablecoins are the primary payment unit

Stablecoins give creators and donors a comprehensible value reference. XLM can
remain available as a secondary Stellar-native option, but product copy and
growth experiments should lead with stablecoin donations.

### 6. Creator distribution comes before platform breadth

Prioritize tools that help a creator receive and promote donations: QR links,
OBS alerts, shareable profiles, reliable payout, and simple onboarding. Do not
build a standalone livestream or creator marketplace.

### 7. APAC is a go-to-market focus, not an unsupported infrastructure claim

Design for APAC languages, mobile usage, and cross-border audiences. Only claim
fiat on-ramp or off-ramp coverage in a country after a verified, compliant
partner integration exists there.

### 8. Ecosystem value must grow from product proof

First prove that StarTip users can complete sponsored C-account payments. Then
extract reusable payment intents, webhooks, widgets, and SDKs. Do not start by
building a generic SDK without a working product and pilot users.

### 9. The smart wallet is a payment guard, not a feature bundle

The C-account should grow from a passkey-controlled wallet into a constrained
payment identity. A passkey answers who approves a payment. Smart-wallet
policies answer what can be paid, to whom, for how much, and for how long.

This allows StarTip to make small donations feel instant while preserving clear
limits for the donor. The product should add policy, recovery, and delegated
payment capabilities only when they make the Creator support loop safer or more
useful. It should not become a general-purpose wallet product.

## What StarTip is not

StarTip is not:

- A livestream hosting platform.
- A custodial wallet or creator balance provider.
- A speculative token, NFT, or loyalty-token project.
- A DEX, bridge, lending product, or yield manager.
- A general-purpose smart wallet.
- An anchor or fiat money transmitter.
- A social network or creator marketplace.
- A place to store donor messages or personal data on-chain.

These boundaries can change only when user evidence shows that a new capability
is required to strengthen the core payment loop.

## Decision filter

Before adding a roadmap item, answer all five questions:

1. Does it reduce time, confusion, or failure between QR scan and confirmed donation?
2. Does it help creators receive, display, retain, or understand donations?
3. Does Stellar provide a meaningful advantage for this feature?
4. Can the result be demonstrated or measured with real users?
5. Is it more important than reliability, security, or completion of the current flow?

If the answer to the first three questions is no, reject the feature. If the
answer to question five is no, defer it.

## Success measures

### Donor activation

- QR scan to donation form opened.
- Passkey registration success rate.
- C-account deployment success rate.
- Donation approval and settlement success rate.
- Median time from QR scan to confirmed donation.

### Creator value

- Time from creator signup to a usable QR and overlay.
- Number of creators who receive a first donation.
- Repeat donations per creator.
- Donation volume settled directly to creator payout addresses.

### Reliability

- Percentage of confirmed transactions indexed exactly once.
- Median time from ledger confirmation to OBS alert.
- Sponsor balance and relayer availability.
- Number of replay, mismatch, or invalid-authorization attempts rejected.

### Ecosystem value

- Number and value of stablecoin donations settled on Stellar.
- Number of passkey-backed C-accounts activated through StarTip.
- Number of third-party integrations using StarTip payment intents or webhooks.
- Public documentation, verified contract source, and reusable integration code.

## Funding narrative

StarTip should present itself as a consumer payment product with an infrastructure
path, not as a feature demo.

- Today: a working QR tipping MVP with Soroban settlement and realtime OBS alerts.
- Hackathon release: remove crypto onboarding friction with passkeys and sponsored fees.
- Mainnet pilot: prove repeat usage with real creators and stablecoin donations.
- Ecosystem expansion: expose the proven payment flow as APIs, widgets, and SDKs.

The strongest funding claim is not that StarTip has many features. It is that
StarTip converts Stellar's smart-account, asset, contract, and event primitives
into a consumer workflow that creators can adopt without understanding blockchain.
