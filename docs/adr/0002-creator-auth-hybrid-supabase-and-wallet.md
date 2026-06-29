# Creator authentication: hybrid Supabase Auth + wallet link

## Context

Creators need to log into a dashboard to view donations, edit their profile,
configure their overlay, and moderate messages. They also need to perform
sensitive on-chain actions (register on-chain, update payout address). We need
to pick an identity model that balances Stellar best practice, hackathon
time-box, and a sensible split between "reading the dashboard" and "moving
money."

## Decision

**Two identities, linked once.** A Creator has a Supabase Auth identity (Google
OAuth or magic link) for dashboard sessions, and a Stellar wallet address for
on-chain actions. The two are linked by a one-time `signMessage` proof: the
Creator connects their wallet in the dashboard, signs a challenge message, the
backend verifies the signature and stores `owner_address` on their
`creators` row.

- **Dashboard login**: Supabase Auth. Session is a Supabase JWT; RLS policies
  key off `auth.uid() = creators.user_id`.
- **Wallet link (one-time)**: Creator connects a wallet via Stellar Wallets Kit
  V2 (`StellarWalletsKit.authModal()`), then signs a challenge message via
  `StellarWalletsKit.signMessage(challenge, { networkPassphrase, address })`.
  Backend verifies the Stellar signature and writes `owner_address` to
  `creators`. This is the only time wallet signing is needed for login. The kit
  is installed from JSR (`@creit-tech/stellar-wallets-kit`); see `docs/specs.md`
  §7.6 for the integration contract.
- **Onboarding on-chain**: the Creator signs `register_creator(sha256(handle),
  payout_address)` with their wallet. The backend indexes `CreatorRegistered`,
  verifies the event's owner address matches the linked `owner_address`, and
  marks the Supabase profile as on-chain registered.
- **Sensitive actions** (update payout, self-pause): on-chain transactions
  signed by the wallet. The backend indexes the corresponding event and mirrors
  state to Supabase. The dashboard never writes `payout_address` or
  `owner_address` directly.
- **Read / non-sensitive actions** (view donations, edit display name / avatar /
  bio, configure overlay, moderate messages): Supabase Auth + RLS only, no
  wallet involved.

## Considered Options

- **SEP-0010 (Stellar Web Authentication)**: the canonical Stellar standard for
  web auth (challenge transaction, `manage_data`, server signing key,
  `stellar.toml`). Rejected for the primary login because it is anchor-oriented
  plumbing (home domain, `WEB_AUTH_ENDPOINT`, server signing key, challenge tx
  builder/verifier) that is heavy for a hackathon MVP and does not map cleanly
  onto Supabase Auth sessions. SEP-0010 remains a viable future replacement for
  the `signMessage` link step if we want to drop Supabase Auth entirely.
- **Pure wallet-based auth (signMessage every login)**: one identity, crypto
  native, but requires a custom challenge/verify + Supabase JWT minting flow on
  every login and loses Supabase Auth's built-in session management, OAuth, and
  RLS-by-`auth.uid()` ergonomics.
- **Pure Supabase Auth, no wallet link**: rejected. Without a wallet ownership
  proof the backend cannot trust that the Supabase user actually controls the
  on-chain `owner_address`, which would let anyone claim any Stellar address.

## Consequences

- `creators` table gains a `user_id uuid references auth.users(id)` column (the
  Supabase identity) alongside `owner_address` (the linked Stellar identity).
  `owner_address` is only writable by the backend after a verified `signMessage`
  proof, never by the client.
- RLS for `creators`, `donations`, `overlay_settings` keys off
  `auth.uid() = creators.user_id` (via join for `donations`). Public read
  policies cover only public fields / visible donations.
- The dashboard has two "connect" concepts that must be communicated clearly:
  "log in" (Supabase) and "link wallet" (one-time). The UI should make this
  distinction obvious to avoid confusing Creators.
- Losing access to the Supabase account locks the Creator out of the dashboard
  even if they still hold the wallet. A recovery path (re-link wallet to a new
  Supabase account via on-chain proof) is a post-MVP concern.
- Fans/Donors may optionally authenticate with Supabase (magic link, same flow
  as Creator login but without onboarding or wallet link). Auth is never
  required to donate: an anonymous Donor connects a wallet and signs `donate()`
  with no Supabase session. A logged-in Donor's `user_id` is stored on the
  Donation record to enable tracking and leaderboard ranking; an anonymous
  Donor's `user_id` is NULL. `/api/donations/prepare` is rate-limited by IP and
  stores `user_id` only when a session is present.
- **`signMessage` wallet constraint**: Stellar Wallets Kit V2 does not support
  `signMessage` on every module (WalletConnect cannot sign messages). The
  wallet-link step therefore requires a message-signing-capable wallet.
  Freighter (in `defaultModules()`) supports it and is the documented primary
  wallet. If a Creator picks a wallet that cannot sign messages, the link step
  fails with a clear message and they must reconnect with a capable wallet.
  Donor `donate()` only uses `signTransaction`, which all modules support, so
  this constraint does not affect donors.
