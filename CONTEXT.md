# StarTip

A QR-based live tipping app. Fans donate Stellar assets to Creators via a Soroban
contract that handles fee split and event proof; Supabase powers the off-chain
consumer experience (messages, overlay, dashboard, moderation).

## Language

**User**:
The generic Supabase Auth subject. Identified by a Supabase `user_id` (UUID).
Has no on-chain identity by default. A User becomes a Creator by completing
onboarding. A User may also act as a Donor by connecting a wallet, but that
wallet activity is never linked back to their `user_id` on a Donation record.
_Avoid_: account (overloaded with Stellar account).

**Creator**:
A User who has completed onboarding and receives Donations. Has a Supabase
identity (`user_id`), a unique Handle, a linked Stellar `owner_address`, and an
on-chain entry in DonationRouter. Until on-chain registration is complete, the
Creator is in an intermediate onboarding state (see Onboarding State).
_Avoid_: Streamer, account (use "user" only for the generic auth subject).

**Profile**:
The off-chain row in `profiles` representing a User. Created automatically on
first Supabase login. Carries the shared identity fields (`user_id`,
`display_name` defaulting to "Anonymous", `avatar_url`, `bio`) plus, when the
User becomes a Creator, the Creator fields (`handle`, `handle_hash`,
`owner_address`, `payout_address`, `onchain_registered`, `paused`,
`wallet_link_nonce`, `wallet_link_nonce_expires_at`). A pure Donor has only the
identity fields set; Creator fields stay NULL until onboarding. One User has
exactly one Profile; the same `display_name` and `avatar_url` are used whether
the User acts as a Creator or as a Donor.
_Avoid_: creator record, donor record, account (overloaded).

**On-chain Creator**:
A Creator whose Handle Hash has an entry in DonationRouter (`owner_address` +
`payout_address`). The on-chain source of truth for who may receive Donations
and who may update the Payout Address. A Profile with
`onchain_registered = false` is not yet an On-chain Creator.

**Onboarding State**:
The lifecycle of a Profile from Supabase login to on-chain registration.
Four gates, each blocking the next:

1. `profile_pending` — Supabase login done, Handle claimed off-chain, no
   `owner_address` yet. Redirected to `/onboarding`.
2. `wallet_pending` — Handle claimed, wallet not linked. Can enter `/dashboard`
   but cannot set Payout Address or register on-chain.
3. `onchain_pending` — `owner_address` linked, not yet registered on-chain.
   Can build and sign `register_creator(handle_hash, payout_address)`.
4. `active` — `onchain_registered = true`. All dashboard routes unlocked.
   _Avoid_: onboarding step (a state, not a step).

**Donor**:
A person who sends a Donation to a Creator. The on-chain role bound to the
address that signs `donate()`. A Donor may be anonymous (no Supabase identity,
only a wallet) or a logged-in User who has chosen to authenticate for tracking
and leaderboard ranking. Auth is never required to donate: an anonymous Donor
connects a wallet and signs `donate()` with no Supabase session. A logged-in
Donor's `user_id` is stored on the Donation record; an anonymous Donor's
`user_id` is NULL. A Donor is never required to be a Creator.
_Avoid_: Fan, supporter, tipper.

**Donor Name**:
The name displayed alongside a Donation on the Overlay and leaderboards. For a
logged-in Donor, sourced from their Profile `display_name`. For an anonymous
Donor, entered on `/donate/[handle]` at donate time, defaulting to "Anonymous".
Stored on the Donation record, not derived from `user_id`.
_Avoid_: fan name, supporter name.

**Handle**:
The unique human-readable slug identifying a Creator. Used in URLs
(`/donate/[handle]`, `/overlay/[handle]`) and hashed to form the Creator ID Hash.
Has two ownership states:

- **Reserved**: a Profile row exists with this Handle but
  `onchain_registered = false`. Known only to the claiming Creator and the
  backend; not publicly listed. Held by a 7-day TTL: a Reserved Handle whose
  Profile is older than 7 days and still `onchain_registered = false`
  is deleted by a Supabase cron job, releasing the Handle.
- **Registered**: DonationRouter has an entry for `sha256(handle)`. The
  public source of truth; only a Registered Handle can receive Donations.
  Claiming a Handle checks both sources: no existing Profile with that
  Handle, and no on-chain entry for `sha256(handle)` (via `get_creator`).
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

**Payout Address**:
The Stellar address that receives the net amount of a Donation. Controlled by
the Creator, set during self-registration, updateable by the Creator's owner.
_Avoid_: wallet, receiving address, creator address.

**Owner Address**:
The Stellar address a Creator links to their Profile via a one-time
`signMessage` proof. The on-chain identity of the Creator; authorises
`register_creator`, payout updates, and self-pause. Distinct from the Payout
Address: the Owner Address controls the Creator entry, the Payout Address
receives funds. A single Owner Address may be linked to multiple Creator
Profiles (one wallet, many Handles); DonationRouter on-chain likewise permits
one address to register multiple handle hashes. Mutable off-chain while the
Profile is not yet on-chain registered (`onchain_registered = false`):
a Creator may re-link a different wallet via the same `signMessage` flow before
calling `register_creator`. Once `onchain_registered = true`, the on-chain
`owner` is immutable (DonationRouter has no `update_owner`), and the off-chain
`owner_address` must match it and can no longer be changed.
_Avoid_: wallet (overloaded), creator address, linked address.

**Donate Wallet**:
The browser wallet connected via the Stellar Wallets Kit, used to sign
`donate()`. Shown in the nav as a connect/address pill, always available, never
requires login. Distinct from the Owner Address: the Donate Wallet is the
Donor's signing wallet for a single Donation act, the Owner Address is the
Creator's persistent on-chain identity. The same physical wallet may serve both
roles but the concepts are tracked separately.
_Avoid_: connected wallet (overloaded), nav wallet, browser wallet.

**Wallet Link Challenge**:
A single-use nonce + expiry stored on the Profile row
(`wallet_link_nonce`, `wallet_link_nonce_expires_at`) that the Creator signs
with their wallet to prove ownership of an address. Backend generates the
nonce (RLS: only the profile's `user_id` may write it), the Creator signs a
human-readable UTF-8 string containing Handle, handle*hash, and the nonce via
`signMessage`, the backend verifies the signature and expiry, writes
`owner_address`, and nulls the nonce. One row, no separate table, no join.
State is bound to the exact Profile and cannot be replayed against
another profile.
\_Avoid*: auth challenge, signMessage payload.

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

**Token Metadata**:
The off-chain row in `tokens` mapping a SAC contract address to human-readable
fields (`symbol`, `name`, `issuer`, `decimals`, `icon_url`). Seeded and
maintained by the indexer: on `TokenAllowlistUpdated { added: true }` the
indexer queries the contract once for `symbol()` / `name()` / `decimals()`
and inserts the row; on `added: false` it deletes the row. Public read; the
donate UI joins this table to render the token picker. `decimals` is required
to convert the on-chain raw `i128` amount to a display amount.
_Avoid_: token info, token config.

**Overlay**:
A browser source page (`/overlay/[overlay_id]`) the Creator adds to OBS.
Subscribes to Supabase Realtime and renders Donation alerts on the
livestream, optionally reading each Donation aloud via Text-to-Speech.
Addressed by Overlay ID, not Handle: unlike `/donate/[handle]`, the Overlay
route must not be guessable from public information, since it is the
Creator's private OBS browser-source URL.
_Avoid_: alert widget, notification layer.

**Overlay ID**:
An opaque, unguessable token identifying a Creator's Overlay, distinct from
Handle. Generated automatically once onboarding completes; the Creator may
regenerate it from the dashboard, which immediately invalidates the previous
`/overlay/[overlay_id]` URL (old browser sources 404). Never derived from or
exposed alongside the Handle. Analogous to a stream key: whoever holds it can
view the Creator's live Overlay, so it is not published anywhere public.
_Avoid_: stream key (used only as an analogy), overlay token (implementation
detail), overlay handle.

**Donation Alert**:
The visual card rendered on the Overlay for a single Donation (Donor Name,
amount + token symbol, message), auto-dismissed after `alert_duration_ms`
(spec §11.3) or, when Text-to-Speech is enabled, after the Alert Reading
finishes if that takes longer. Distinct from the Alert Reading: the Alert can
render before, during, or without a Reading.
_Avoid_: alert (ambiguous with Alert Reading), toast.

**Alert Reading**:
The Text-to-Speech narration of a Donation Alert (Donor Name, amount +
message, capped to the first ~200 characters) in the Creator's configured
Voice. Plays once, after the Overlay's alert sound (when enabled), and never
replays. Absent when Text-to-Speech is disabled, the Creator has not chosen a
Voice, or synthesis fails/times out; the Donation Alert always renders
regardless of whether the Reading succeeds.
_Avoid_: TTS, narration, speech (be specific: an Alert Reading is scoped to
one Donation Alert).

**Voice**:
A Text-to-Speech Provider's named speech identity (e.g. an edge-tts voice
like `vi-VN-HoaiMyNeural`), carrying an implicit locale that determines the
Alert Reading's sentence template. Chosen per-Creator in Overlay settings;
`null` means Text-to-Speech is unconfigured even if `tts_enabled` is true.
_Avoid_: speaker, model.

**Text-to-Speech Provider**:
A pluggable backend that turns an Alert Reading's text into audio for a given
Voice. The Worker owns Provider selection; `edge-tts` is the only Provider
today. Never chosen by the Creator directly, only through the Voice they
pick.
_Avoid_: TTS engine, TTS service.

**Moderation Status**:
The visibility state of a Donation's message on the Overlay
(`visible` | `hidden`). Set by the Creator. Independent of on-chain state.
_Avoid_: flag, filter state.

**Leaderboard**:
A public ranking of Donors by total donated amount. Two scopes:

- **Global Leaderboard**: across all Creators. Top Donors by aggregate amount.
- **Creator Leaderboard**: scoped to a single Creator (`/donate/[handle]` or
  dashboard). Top Donors to that Creator.
  Both are public and show Donor Name + total amount. Only Donations with a
  `user_id` (logged-in Donors) contribute; anonymous Donations are excluded from
  leaderboards. Computed from the `donations` table, not stored as a separate
  aggregate.
  _Avoid_: ranking, top donors (be specific about scope).

## Boundaries

- **On-chain (DonationRouter)**: Creator registry (Handle hash → owner + payout),
  Platform Fee config, `max_fee_bps` (immutable), Treasury address, Admin role
  (`set_admin`), Token Allowlist, `paused` switch, Donation settlement,
  `DonationReceived` event, Donation ID Hash. Nothing else.
- **Off-chain (Supabase)**: full message, donor name, Profile, Overlay ID,
  Overlay theme, Voice choice, Leaderboard, donation goal, Moderation Status,
  dashboard data.
