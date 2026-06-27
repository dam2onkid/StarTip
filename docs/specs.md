# StarTip — Validated Spec

> Supersedes `docs/temp-specs.md`. This spec reflects the decisions recorded in
> `CONTEXT.md` and `docs/adr/0001-0003`, reached via a grilling session.
> `temp-specs.md` is kept for history only; do not build from it.

## 1. Name

**StarTip**

## 2. One-liner

Fan scans a QR on a livestream, donates a Stellar asset to a Creator through a
Soroban contract that splits a platform fee and emits an on-chain event, while
an OBS overlay shows the alert in realtime.

## 3. Hackathon track

Track: **Payment & Consumer Applications**

- A consumer-friendly payment tool for everyday users.
- Donation / tipping use case for livestream Creators.
- Soroban contract for settlement, fee split, and on-chain proof.
- Supabase for the off-chain product data and realtime UX.

## 4. Users

### 4.1 Creator

A small-to-mid streamer on TikTok Live, YouTube Live, Twitch, Facebook Gaming,
or OBS.

Needs:

- Create a donate link and QR quickly.
- Show the QR on a livestream.
- Receive donations near-realtime.
- Show an alert when a donation lands.
- See revenue, top supporters, donation history.
- A dedicated payout address.

### 4.2 Donor

A livestream viewer.

Needs:

- Scan a QR and donate quickly.
- Send a nickname and a message.
- Know the transaction succeeded.
- Not need to understand blockchain deeply.

## 5. MVP scope

### 5.1 In scope

1. Creator creates a Supabase profile (Handle, display name, avatar, bio).
2. Creator links a Stellar wallet via a one-time `signMessage` proof.
3. Creator self-registers on-chain via `register_creator(sha256(handle),
   payout_address)`.
4. App generates a donate link and QR code.
5. Donor opens `/donate/[handle]`, picks an asset (XLM, USDC testnet, ...),
   enters amount, nickname, message.
6. Donor connects a Stellar wallet and calls `donate()` on the contract.
7. Contract splits the fee to Treasury and the net to the Creator's payout
   address, emits `DonationReceived`.
8. Confirm path + indexer path upsert the donation into Supabase.
9. Overlay at `/overlay/[handle]` receives the donation via Supabase Realtime
   and shows an alert.
10. Dashboard shows recent donations, total volume, top supporters, donation
    goal, QR, overlay URL.

### 5.2 Optional (if time allows)

- Custom alert themes.
- Per-stream donation goals and leaderboards (requires re-introducing the
  `streams` table, see ADR-0001 consequences).
- Passkey / smart-account wallet UX.
- Sponsored transaction fees.
- Basic message moderation UI beyond toggle.
- SEP-0010 to replace the `signMessage` link step.

### 5.3 Out of scope

- Native mobile app.
- Fiat on/off-ramp in production.
- KYC.
- Escrow / refund / dispute.
- Monthly subscriptions.
- NFT badges.
- A standalone livestream platform.
- A streamer marketplace.
- Complex AI moderation.
- Tax / accounting reports.
- Admin panel UI (admin ops run via `stellar` CLI, see ADR-0001 consequences).

## 6. Architecture principles

Hybrid model:

```txt
DonationRouter contract = financial settlement layer
Supabase                 = product database / realtime UX layer
```

The split is fixed by ADR-0001.

### 6.1 On-chain (DonationRouter)

- Creator registry: `sha256(handle) -> { owner, payout_address, active }`.
- Platform fee config (`platform_fee_bps`, `max_fee_bps`).
- Treasury address.
- `paused` emergency switch.
- Donation settlement (fee + net transfer).
- `DonationReceived` event with `donation_id_hash`.
- Nothing else. No message, no donor name, no history arrays, no message hash.

### 6.2 Off-chain (Supabase)

- Full message and donor name.
- Creator profile (display name, avatar, bio, Handle).
- Overlay theme and settings.
- Recent donations, leaderboard, donation goal.
- Moderation status.
- Dashboard data.
- `indexer_state` cursor.

## 7. Tech stack

### 7.1 Frontend

- Next.js (App Router), TypeScript.
- Tailwind CSS, shadcn/ui (see `design.md` / `DESIGN.md`).
- Stellar Wallets Kit (V2, JSR) for both Creator wallet link and Donor
  `donate()` signing. See §7.6 for the integration contract.
- QR code package.

### 7.2 Backend

- Next.js Route Handlers / server actions.
- Supabase client (service role for indexer/confirm, anon for public reads).
- `@stellar/stellar-sdk` for RPC, tx verification, event parsing.
- Indexer job (Vercel Cron -> `/api/indexer/poll`).

### 7.3 Database / realtime

- Supabase Postgres, Auth (Google OAuth + magic link), Realtime, RLS.

### 7.4 Blockchain

- Stellar Testnet.
- Soroban contract in Rust (`soroban-sdk`).
- SAC tokens via `token::Client` for transfers.

### 7.5 Deploy

- Vercel (web + cron).
- Supabase hosted project.
- Stellar Testnet for the contract.

### 7.6 Wallet integration (Stellar Wallets Kit V2)

Source of truth: <https://stellarwalletskit.dev>. The kit moved from NPM
(`@creit.tech/stellar-wallets-kit`, V1) to JSR (`@creit-tech/stellar-wallets-kit`,
V2) with a static-class API. Use V2.

**Install (JSR):**

```bash
npx jsr add @creit-tech/stellar-wallets-kit
```

**Subpath imports used by this project:**

- `@creit-tech/stellar-wallets-kit/sdk` — `StellarWalletsKit`, `Networks`.
- `@creit-tech/stellar-wallets-kit/modules/utils` — `defaultModules()`.
- `@creit-tech/stellar-wallets-kit/types` — `KitEventType`, `SwkAppDarkTheme`.
- `@creit-tech/stellar-wallets-kit/components` — `ButtonMode` (only if using the
  built-in button).

**Init (browser only, guard against SSR):**

```typescript
import { StellarWalletsKit, Networks } from "@creit-tech/stellar-wallets-kit/sdk";
import { SwkAppDarkTheme } from "@creit-tech/stellar-wallets-kit/types";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";

if (typeof window !== "undefined") {
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
    theme: SwkAppDarkTheme, // aligns with the Graphite palette in design.md
  });
}
```

`defaultModules()` ships Albedo, Freighter, Hana, Lobstr, Rabet, xBull, Klever,
OneKey, Bitget. Ledger, Trezor, WalletConnect, HOT are opt-in (import the
specific module from `@creit-tech/stellar-wallets-kit/modules/<wallet>`). MVP
ships `defaultModules()` only; Freighter is the documented primary wallet.

**Connect / get address:**

```typescript
const { address } = await StellarWalletsKit.authModal(); // first time
// later loads:
const { address } = await StellarWalletsKit.getAddress(); // throws if none
```

**Subscribe to state (address changes, disconnect):**

```typescript
import { KitEventType } from "@creit-tech/stellar-wallets-kit/types";

const unsub = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) => {
  // e.payload.address, e.payload.networkPassphrase
});
const unsubDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
  // log out
});
// call unsub() / unsubDisconnect() on cleanup to avoid leaks
```

**Sign a transaction (Donor `donate()`, Creator `register_creator` /
`update_creator_payout`):**

```typescript
const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
  networkPassphrase: Networks.TESTNET,
  address,
});
```

**Sign a message (Creator wallet link, ADR-0002):**

```typescript
const { signedMessage } = await StellarWalletsKit.signMessage(challenge, {
  networkPassphrase: Networks.TESTNET,
  address,
});
```

> `signMessage` is **not** supported by every wallet module (WalletConnect
> cannot sign messages). The wallet-link flow therefore requires a
> message-signing-capable wallet; Freighter (in `defaultModules()`) supports it.
> If a Creator picks a wallet that cannot sign messages, the link step fails
> with a clear message and they must pick another wallet. This constraint is
> documented in ADR-0002.

**Built-in button (optional, themed):**

```typescript
const wrapper = document.querySelector("#walletButton");
StellarWalletsKit.createButton(wrapper, {
  mode: ButtonMode.free,
  classes: "btn btn-primary", // style with the Graphite tertiary accent
});
```

Or render a custom shadcn button and call `StellarWalletsKit.authModal()` on
click. MVP uses a custom shadcn button for consistency with `design.md`.

## 8. Architecture overview

```txt
Donor
  | scan QR
  v
Donate Page /donate/[handle]
  | POST /api/donations/prepare  -> backend mints donation_id, donation_id_hash, pending row
  | connect wallet
  | sign donate() tx
  v
DonationRouter contract
  | require_auth(donor)
  | token.transfer(donor -> treasury, fee)
  | token.transfer(donor -> creator.payout, net)
  | emit DonationReceived
  v
Two write paths into Supabase donations:
  | /api/donations/confirm  (fast, frontend-triggered)
  | /api/indexer/poll       (reconcile, cron)
  v
Supabase donations table (upsert by tx_hash)
  v
Supabase Realtime
  v
OBS Overlay /overlay/[handle]
```

## 9. Smart contract spec — DonationRouter

### 9.1 Role

The contract holds only trust-minimized state (ADR-0001): who is a valid
Creator, where they get paid, the platform fee, the treasury, how a donation
settles, and the event proof.

### 9.2 Global config (instance storage)

```rust
Config {
    admin: Address,
    treasury_address: Address,
    platform_fee_bps: u32,
    max_fee_bps: u32,
    paused: bool,
}
```

- `platform_fee_bps`: basis points, `100 = 1%`.
- `max_fee_bps` caps admin fee changes. MVP default `500` (max 5%).
- `0` is a valid fee (100% to Creator).

### 9.3 Creator (persistent storage)

```rust
Creator {
    owner: Address,
    payout_address: Address,
    active: bool,
}
```

Keyed by `creator_id_hash: BytesN<32> = sha256(handle)`.

### 9.4 Storage layout

- **Instance**: `admin`, `treasury_address`, `platform_fee_bps`, `max_fee_bps`,
  `paused`.
- **Persistent**: `creator_id_hash -> Creator`.
- **Not stored**: message, donor name, donation history, leaderboard, overlay
  state, stream metadata.

### 9.5 Public functions

```rust
// Constructor (CAP-0058) or guarded initialize.
__constructor(admin, treasury_address, platform_fee_bps, max_fee_bps)

// Self-register. caller = creator_owner (require_auth). owner is the invoker,
// not an argument.
register_creator(creator_id_hash: BytesN<32>, payout_address: Address)

update_creator_payout(creator_id_hash: BytesN<32>, new_payout_address: Address)
set_creator_active(creator_id_hash: BytesN<32>, active: bool)

set_treasury_address(new_treasury_address: Address)
set_platform_fee_bps(new_fee_bps: u32)
set_paused(paused: bool)

donate(
    creator_id_hash: BytesN<32>,
    token: Address,
    amount: i128,
    donation_id_hash: BytesN<32>,
)
```

### 9.6 Authorization

| Function | Authorized by |
|---|---|
| `__constructor` | deployer |
| `register_creator` | caller (becomes `owner`) |
| `update_creator_payout` | Creator's `owner` |
| `set_creator_active` | Creator's `owner` OR admin |
| `set_treasury_address` | admin |
| `set_platform_fee_bps` | admin |
| `set_paused` | admin |
| `donate` | donor (caller) |

### 9.7 Donate logic

```txt
Input: creator_id_hash, token, amount, donation_id_hash
Steps:
1. require_auth(donor)  // donor is the caller
2. require !paused
3. require creator exists
4. require creator.active
5. require amount > 0
6. validate token is a legitimate SAC token address (not arbitrary contract)
7. fee_amount  = amount * platform_fee_bps / 10_000
8. net_amount  = amount - fee_amount
9. token.transfer(donor, treasury_address, fee_amount)   // auth propagation
10. token.transfer(donor, creator.payout_address, net_amount)
11. emit DonationReceived
```

No `approve`/`transfer_from`. The donor signs `donate()` once; Soroban auth
propagation covers the nested `token.transfer` calls (ADR-0001).

### 9.8 Events

```rust
DonationReceived {
    creator_id_hash: BytesN<32>,
    donor_address: Address,
    token: Address,
    amount: i128,
    fee_amount: i128,
    net_amount: i128,
    treasury_address: Address,
    payout_address: Address,
    donation_id_hash: BytesN<32>,
}

CreatorRegistered {
    creator_id_hash: BytesN<32>,
    owner: Address,
    payout_address: Address,
}

CreatorPayoutUpdated {
    creator_id_hash: BytesN<32>,
    old_payout_address: Address,
    new_payout_address: Address,
}

CreatorActiveChanged {
    creator_id_hash: BytesN<32>,
    active: bool,
}

PlatformFeeUpdated { old_fee_bps: u32, new_fee_bps: u32 }
TreasuryUpdated { old_treasury_address: Address, new_treasury_address: Address }
PausedChanged { paused: bool }
```

`message_hash` is intentionally absent (ADR-0001): moderation can edit a
message, so binding its hash on-chain would either break or lie.

## 10. Message design

### 10.1 Full message off-chain only

The full message lives in Supabase because it may need moderation, hiding, or
editing, and should not be public forever. The contract never sees it.

### 10.2 On-chain link

Only `donation_id_hash = sha256(donation_id)` is committed on-chain, in the
`DonationReceived` event. Supabase stores `donation_id` and `donation_id_hash`.
The hash binds the on-chain event to the off-chain record; the message itself is
free to change under moderation without breaking any on-chain invariant.

## 11. Supabase schema

### 11.1 creators

```sql
create table creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,  -- Supabase identity (ADR-0002)
  owner_address text,            -- linked Stellar identity, set only after signMessage proof
  payout_address text not null,
  handle text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  is_active boolean default true,
  onchain_registered boolean default false,  -- set when CreatorRegistered indexed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

`creator_id_hash` is not stored; it is derived as `sha256(handle)` wherever
needed. `owner_address` is writable only by the backend after a verified
`signMessage`; `payout_address` is mirrored from on-chain events only.

### 11.2 donations

```sql
create table donations (
  id uuid primary key default gen_random_uuid(),
  donation_id text unique not null,
  donation_id_hash text unique not null,

  creator_id uuid references creators(id) on delete cascade,

  donor_name text,
  message text,

  donor_address text not null,
  token_address text not null,
  asset_code text not null,

  amount numeric not null,
  fee_amount numeric not null,
  net_amount numeric not null,

  treasury_address text not null,
  payout_address text not null,

  tx_hash text unique not null,
  ledger integer,
  status text not null default 'pending',  -- pending | confirmed | indexed

  moderation_status text not null default 'visible',  -- visible | hidden | auto_hidden

  created_at timestamptz default now(),
  indexed_at timestamptz,
  confirmed_at timestamptz
);
```

`stream_id` is absent (ADR-0001): donations belong to a Creator, not a stream,
in the MVP.

### 11.3 overlay_settings

```sql
create table overlay_settings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  alert_duration_ms integer default 6000,
  min_amount numeric default 0,
  sound_enabled boolean default true,
  theme text default 'default',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 11.4 indexer_state

```sql
create table indexer_state (
  id int primary key default 1,
  last_ledger bigint not null,
  last_cursor text,
  updated_at timestamptz default now(),
  constraint singleton check (id = 1)
);
```

### 11.5 RLS

- `creators`: public read of `handle, display_name, avatar_url, bio,
  payout_address, owner_address, is_active`. Owner write of `display_name,
  avatar_url, bio` (policy: `auth.uid() = creators.user_id`).
- `donations`: public read of rows where `moderation_status = 'visible'`.
  Creator (join to `creators` on `user_id`) read all + update
  `moderation_status`. Insert only via service role (confirm + indexer).
- `overlay_settings`: public read; owner write.
- `indexer_state`: no public access; service role only.

## 12. App routes

### 12.1 Public

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/s/[handle]` | Public Creator profile |
| `/donate/[handle]` | Donor donation page |
| `/overlay/[handle]` | OBS browser source overlay |

### 12.2 Authenticated (Supabase Auth)

| Route | Purpose |
|---|---|
| `/dashboard` | Creator dashboard |
| `/dashboard/profile` | Edit display name, avatar, bio |
| `/dashboard/wallet` | Link wallet (signMessage), view owner_address |
| `/dashboard/payout` | Update payout address (on-chain tx) |
| `/dashboard/overlay` | Overlay settings + copy overlay URL |
| `/dashboard/donations` | Donation history + moderation |

### 12.3 API

| Route | Purpose |
|---|---|
| `POST /api/creators` | Create Supabase profile (reserve Handle) |
| `POST /api/wallet/link` | Verify signMessage, store owner_address |
| `POST /api/donations/prepare` | Mint donation_id + hash, insert pending row |
| `POST /api/donations/confirm` | Verify tx + event, upsert by tx_hash |
| `POST /api/indexer/poll` | Cron: scan events from cursor, upsert, reconcile |
| `GET /api/creators/[handle]` | Public Creator profile |
| `GET /api/creators/[handle]/leaderboard` | Leaderboard |

Admin functions (`set_platform_fee_bps`, `set_treasury_address`, `set_paused`,
admin `set_creator_active`) are not exposed as API routes; they run via the
`stellar` CLI with `ADMIN_SECRET_KEY` (ADR-0001 consequences).

## 13. Flows

### 13.1 Creator onboarding

```txt
1. Creator signs in via Supabase Auth (Google / magic link).
2. Creator creates a profile: picks a Handle, display name, bio, avatar.
   -> POST /api/creators reserves the Handle (unique constraint).
3. Creator connects Freighter in /dashboard/wallet.
4. Creator signs a signMessage challenge.
   -> POST /api/wallet/link verifies the signature, stores owner_address.
5. Creator enters a payout address and signs register_creator(sha256(handle),
   payout_address) with the wallet.
6. Backend indexes CreatorRegistered, verifies owner_address matches, sets
   onchain_registered = true.
7. App generates the donate link and QR code.
8. Creator copies /overlay/[handle] into OBS.
```

### 13.2 Donor donate

```txt
1. Donor scans QR, opens /donate/[handle].
2. Donor picks an asset (XLM, USDC, ...), enters amount, donor_name, message.
3. Frontend POST /api/donations/prepare.
   Backend mints donation_id (UUID), computes donation_id_hash, inserts a
   pending row, returns the hash (and creator_id_hash, token, amount).
4. Donor connects a wallet.
   If the asset is non-native and the donor lacks a trustline, the UI builds a
   change_trust op for the donor to sign first.
5. Frontend builds donate(creator_id_hash, token, amount, donation_id_hash),
   donor signs, submits to Stellar.
6. Frontend receives the tx hash, POST /api/donations/confirm.
7. Backend verifies the tx and DonationReceived event, upserts by tx_hash,
   sets status = confirmed, runs moderation keyword filter.
8. Supabase Realtime notifies the overlay.
9. Alert appears on the livestream.
```

### 13.3 Overlay alert

```txt
1. OBS opens /overlay/[handle].
2. Overlay subscribes to Supabase Realtime on donations where
   creator_id = (creator for handle) and moderation_status = 'visible'.
3. New confirmed/indexed donation arrives.
4. Overlay checks amount >= overlay_settings.min_amount.
5. Overlay renders donor_name, amount, asset_code, message.
6. Alert disappears after alert_duration_ms. Multiple alerts queue.
```

### 13.4 Update payout (sensitive)

```txt
1. Creator enters a new payout address in /dashboard/payout.
2. Frontend builds update_creator_payout(sha256(handle), new_payout).
3. Creator signs with the wallet, submits.
4. Backend indexes CreatorPayoutUpdated, mirrors new_payout_address to
   creators.payout_address.
```

## 14. Security

### 14.1 Contract

- `require_auth` on every state-changing function per §9.6.
- `amount > 0`, `new_fee_bps <= max_fee_bps`, `!paused` checks in `donate`.
- Validate `token` is a legitimate SAC token address, not an arbitrary contract
  (avoid malicious token contracts that imitate the token interface).
- No unbounded storage growth: donations emit events, not stored arrays.
- Emergency `paused` switch.

### 14.2 Backend

- Verify tx hash and `DonationReceived` event before marking confirmed.
- Verify event fields match the pending row: `creator_id_hash`,
  `donation_id_hash`, `amount`, `token`, `payout_address`, `treasury_address`.
- Idempotent upsert by `tx_hash` (confirm + indexer safe to race).
- Deduplicate `donation_id`.
- Moderation keyword filter at insert time in both paths.
- `owner_address` only set after a verified `signMessage`; never client-writable.
- `payout_address` mirrored from on-chain events only; never client-writable.

### 14.3 Frontend

- Escape message output in the overlay (XSS).
- Limit message and donor name length.
- Show transaction status and tx hash link clearly.
- Never trust client-only confirmation; the backend verify is authoritative.

## 15. Realtime / indexing

See ADR-0003. Two idempotent write paths upsert by `tx_hash`:

- **Confirm**: frontend-triggered, fast.
- **Indexer**: Vercel Cron -> `/api/indexer/poll` at ~10s, scans
  `DonationReceived` from `indexer_state.last_ledger`, upserts and reconciles.

`donations.status`: `pending` (not visible) -> `confirmed` | `indexed` (both
visible). Confirm promotes `indexed` -> `confirmed`.

## 16. UI requirements

Follow `design.md` / `DESIGN.md` (Graphite palette, single lime accent, Inter
Tight / Inter / JetBrains Mono).

### 16.1 Donate page

- Asset selector (XLM, USDC, ...).
- Amount buttons: 1, 5, 10, custom.
- Donor name, message.
- Connect wallet button.
- Donate button (single accent per `design.md`).
- Transaction status + tx hash link.
- Trustline guidance if the donor lacks one for the chosen asset.

### 16.2 Dashboard

Cards: total donated today, number of donations, platform fee total, recent
donations, top supporters, donation goal progress, QR code, overlay URL copy.

### 16.3 Overlay

```txt
{donor_name} donated {amount} {asset_code}
"{message}"
```

- Animated entrance, visible for `alert_duration_ms`, queue multiple alerts.
- Ignore `moderation_status != 'visible'` and `amount < min_amount`.
- Optional sound.

## 17. Demo script (blank state, all live)

1. Open the landing page, click "Become a Creator".
2. Sign in with Supabase Auth (Google).
3. Create a profile: Handle `minh`, display name, bio.
4. Connect Freighter, sign the signMessage link.
5. Enter a payout address, sign `register_creator` on-chain.
6. Open the dashboard: show QR and overlay URL.
7. Open `/overlay/minh` in a second tab (OBS simulation).
8. Open `/donate/minh` in a third tab (donor).
9. Donate 5 XLM: name `Minh`, message `Chuc anh win game!`.
10. Connect wallet, submit `donate()`.
11. Show the tx hash and `DonationReceived` event.
12. Show the dashboard updating and the overlay alert.
13. Donate 2 USDC: show the trustline guidance, then `donate()`.
14. Show the fee split: fee to treasury, net to payout.

No seeded data; every donation has a real tx hash.

## 18. Success criteria

- DonationRouter deployed on Stellar Testnet.
- A Creator can self-register with a payout address.
- A Donor can donate XLM and USDC through the contract.
- The contract splits the platform fee correctly.
- The contract emits `DonationReceived` with `donation_id_hash`.
- Full message stored off-chain in Supabase.
- Dashboard shows new donations.
- Overlay shows alerts in realtime.
- Every donation has a tx hash / on-chain proof.
- Confirm + indexer both populate Supabase without duplicates.

## 19. Implementation order

1. **Project setup**: Next.js, Tailwind, shadcn, Supabase client, Stellar
   Wallets Kit, `@stellar/stellar-sdk`.
2. **Database**: `creators`, `donations`, `overlay_settings`, `indexer_state`;
   RLS policies.
3. **Auth**: Supabase Auth (Google + magic link); `/api/wallet/link`
   signMessage verify.
4. **Contract**: `__constructor`, `register_creator`, `set_platform_fee_bps`,
   `set_treasury_address`, `update_creator_payout`, `set_creator_active`,
   `set_paused`, `donate`, events. Unit tests.
5. **Onboarding flow**: profile creation, wallet link, on-chain register,
   indexing of `CreatorRegistered`.
6. **Donate flow**: prepare, asset selector, trustline guidance, `donate()`,
   confirm.
7. **Indexer**: `/api/indexer/poll`, cursor, idempotent upsert, Vercel Cron.
8. **Dashboard**: profile, payout, overlay settings, donations, moderation.
9. **Overlay**: Realtime subscription, alert rendering, queue.
10. **Polish**: error/loading states, demo run, README, pitch.

## 20. Core pitch

> StarTip is a QR-based live tipping app for streamers. Fans donate Stellar
> assets through a Soroban contract that splits a platform fee and emits an
> on-chain event, while an OBS overlay shows the alert in realtime. The contract
> handles only the financial layer: creator payout registry, fee split, and
> event proof. Supabase powers the consumer experience: messages, dashboards,
> leaderboards, moderation, and realtime overlays.
