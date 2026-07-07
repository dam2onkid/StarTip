# StarTip — Idea Submission

## 1. Problem Statement

Live streamers, podcasters, and digital creators rely on centralized tipping
platforms that take high fees, delay payouts, lock funds in custodial wallets,
and exclude creators in regions without access to traditional payment rails.
Crypto tipping tools exist but are mostly built on high-fee, slow-finality
chains with poor UX: fans must wrestle with extensions, manual addresses, and
no on-stream acknowledgement. There is no lightweight, non-custodial, real-time
tipping layer that a creator can drop into OBS in minutes and a fan can use
with a single wallet signature.

## 2. Proposed Solution

StarTip is a QR-based live tipping app built on Stellar. A creator claims a
unique Handle, links a Stellar wallet, and self-registers on the
`DonationRouter` Soroban contract. They share a donate link or QR; a fan
connects any Stellar wallet (Freighter, Wallet Standard), picks an allowlisted
SAC token, and signs a single `donate()` transaction. The contract validates
the creator, splits the platform fee, transfers the net amount to the creator's
payout address, and emits a `DonationReceived` event. An indexer mirrors the
event into Supabase, which feeds a real-time overlay the creator adds to OBS,
so the donation alert appears on stream within seconds of on-chain
settlement. No custodian, no payout delay, no middleman between fan and
creator.

## 3. Target Users / Audience

- **Live streamers and content creators** on Twitch, YouTube, Kick, and
  podcast platforms who want non-custodial, instant crypto tips with an
  on-stream alert.
- **Fans and donors** who already hold Stellar assets (XLM, USDC, or any
  allowlisted SAC token) and want to tip in one signature, with optional
  anonymity.
- **Creators in underbanked regions** excluded from fiat payout platforms,
  who only need a Stellar wallet to receive funds.

## 4. Stellar Integration

- **Soroban smart contract (`DonationRouter`)**: on-chain source of truth for
  the creator registry (Handle hash → owner + payout address), the admin role,
  the platform fee in basis points, the token allowlist, and a global pause.
  `donate()` validates the creator, enforces the allowlist, splits the fee,
  transfers SAC tokens to the Treasury and the creator's payout address, and
  emits `DonationReceived`.
- **Stellar Asset Contract (SAC)**: all accepted tip tokens are SAC tokens
  bridged to Soroban, so `donate()` uses the unified token interface for
  transfers and metadata (`symbol`, `name`, `decimals`).
- **Stellar Wallets Kit + Wallet Standard**: the donate flow supports any
  compatible browser wallet; creator wallet linking uses a one-time
  `signMessage` proof of address ownership.
- **Stellar RPC + event indexer**: an indexer watches `DonationReceived`
  events via Stellar RPC, resolves token metadata from the contract, and
  writes rows into Supabase, which fans the event out to the OBS overlay via
  Supabase Realtime.
- **`stellar` CLI**: admin operations (fee config, treasury address, token
  allowlist, pause, `set_admin`) run via the CLI against testnet and pubnet.
