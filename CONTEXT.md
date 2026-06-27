# StarTip

A QR-based live tipping app. Fans donate Stellar assets to Creators via a Soroban
contract that handles fee split and event proof; Supabase powers the off-chain
consumer experience (messages, overlay, dashboard, moderation).

## Language

**Creator**:
A streamer who receives donations. Owns a Stellar address and a unique Handle.
_Avoid_: Streamer, account, user (use "user" only for the generic auth subject).

**Donor**:
A person who sends a Donation to a Creator. The on-chain role bound to the
address that signs `donate()`.
_Avoid_: Fan, supporter, tipper.

**Handle**:
The unique human-readable slug identifying a Creator. Used in URLs
(`/donate/[handle]`, `/overlay/[handle]`) and hashed to form the Creator ID Hash.
_Avoid_: username, slug, channel name.

**Creator ID Hash**:
`sha256(handle)`. The on-chain key that identifies a Creator in the
DonationRouter contract. Derived from the Handle, not stored as an independent
field off-chain.
_Avoid_: creator_id, creator hash, fingerprint.

**Donation**:
A single act of sending an asset from a Donor to a Creator through the
DonationRouter. Settled on-chain (fee + net transfer, event emitted), recorded
off-chain (full message, donor name, moderation status).
_Avoid_: tip, payment, transaction (use "transaction" only for the Stellar tx).

**Donation ID Hash**:
`sha256(donation_id)`. The on-chain link between a Donation event and its
off-chain record. The only hash committed on-chain for a Donation.
_Avoid_: donation hash, message hash (message hash is not on-chain).

**Payout Address**:
The Stellar address that receives the net amount of a Donation. Controlled by
the Creator, set during self-registration, updateable by the Creator's owner.
_Avoid_: wallet, receiving address, creator address.

**Treasury**:
The Stellar address that receives the Platform Fee portion of each Donation.
Configured by the Admin.
_Avoid_: fee address, platform wallet.

**Admin**:
The single Stellar address that controls DonationRouter configuration: Platform
Fee, Treasury address, the `paused` switch, the Token Allowlist, and
force-pausing a Creator. Transferable via `set_admin`. Admin operations run via
the `stellar` CLI, not through the web app.
_Avoid_: owner, superuser, operator.

**Platform Fee**:
The percentage of each Donation taken by the platform, expressed in basis points
(`100 bps = 1%`). Global, admin-configurable, capped by `max_fee_bps`.
_Avoid_: commission, cut, service fee.

**DonationRouter**:
The Soroban contract that settles Donations: validates Creator, splits fee,
transfers to Treasury and Payout Address, emits `DonationReceived`. Also owns
the Token Allowlist and the Admin role.
_Avoid_: the contract, router, payment contract (be specific).

**Token Allowlist**:
The on-chain set of SAC token contract addresses that `donate()` accepts.
Maintained by the Admin via `add_token` / `remove_token`. A `donate()` call
with a `token` not in the allowlist reverts. The only mechanism that prevents
a malicious token contract from being passed to `donate()`.
_Avoid_: token list, supported tokens, accepted assets (off-chain UI lists
derive from this but are not the source of truth).

**Overlay**:
A browser source page (`/overlay/[handle]`) the Creator adds to OBS. Subscribes
to Supabase Realtime and renders Donation alerts on the livestream.
_Avoid_: alert widget, notification layer.

**Moderation Status**:
The visibility state of a Donation's message on the Overlay
(`visible` | `hidden`). Set by the Creator. Independent of on-chain state.
_Avoid_: flag, filter state.

## Boundaries

- **On-chain (DonationRouter)**: Creator registry (Handle hash → owner + payout),
  Platform Fee config, `max_fee_bps` (immutable), Treasury address, Admin role
  (`set_admin`), Token Allowlist, `paused` switch, Donation settlement,
  `DonationReceived` event, Donation ID Hash. Nothing else.
- **Off-chain (Supabase)**: full message, donor name, Creator profile, Overlay
  theme, leaderboard, donation goal, Moderation Status, dashboard data.
