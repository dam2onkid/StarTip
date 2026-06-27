> **ARCHIVED.** This temp spec was validated and superseded by
> `docs/specs.md` via a grilling session. Decisions are recorded in
> `CONTEXT.md` and `docs/adr/0001-0003`. Kept for history only; do not build
> from this file.

# Temp Spec — Stellar Streamer Donation App

## 1. Tên tạm

**StreamTip Stellar**

## 2. One-liner

Fan quét QR trên livestream, donate bằng tài sản trên Stellar kèm lời nhắn, smart contract tự chia platform fee và chuyển tiền tới streamer, còn overlay livestream hiển thị alert realtime.

## 3. Hackathon Track Fit

Track: **Payment & Consumer Applications**

Mục tiêu sản phẩm:

- Xây dựng công cụ thanh toán dễ dùng cho người dùng phổ thông.
- Tập trung vào use case donate/tipping cho streamer.
- Dùng Stellar smart contract cho phần settlement, fee split và on-chain proof.
- Dùng Supabase cho dữ liệu off-chain phục vụ trải nghiệm người dùng.

## 4. Người dùng mục tiêu

### 4.1 Streamer

Streamer nhỏ và vừa trên TikTok Live, YouTube Live, Twitch, Facebook Gaming hoặc OBS.

Nhu cầu:

- Tạo link donate nhanh.
- Hiển thị QR trên livestream.
- Nhận donate gần realtime.
- Hiển thị alert khi có người donate.
- Xem doanh thu, top supporter, lịch sử donate.
- Có địa chỉ nhận tiền riêng.

### 4.2 Fan / Supporter

Người xem livestream.

Nhu cầu:

- Quét QR và donate nhanh.
- Gửi nickname và lời nhắn.
- Biết giao dịch đã thành công.
- Không cần hiểu quá sâu về blockchain.

## 5. Phạm vi MVP

### 5.1 Tính năng bắt buộc

1. Streamer tạo profile.
2. Streamer cấu hình địa chỉ nhận tiền.
3. App tạo donate link và QR code.
4. Fan mở donate page.
5. Fan nhập amount, nickname, message.
6. Fan connect ví Stellar.
7. Fan gọi smart contract `donate`.
8. Smart contract chia tiền:
   - platform fee chuyển tới treasury address;
   - phần còn lại chuyển tới payout address của streamer.
9. Smart contract emit event `DonationReceived`.
10. Backend ingest event và lưu donation vào Supabase.
11. OBS overlay nhận realtime event từ Supabase.
12. Dashboard hiển thị recent donations, total volume, leaderboard, donation goal.

### 5.2 Tính năng optional nếu còn thời gian

1. Custom alert theme.
2. Donation goal theo từng stream.
3. Leaderboard theo stream.
4. Passkey wallet / smart wallet UX.
5. Sponsored transaction fee.
6. Multi-asset donation.
7. Basic moderation cho message.

### 5.3 Không làm trong MVP

1. Native mobile app.
2. Fiat on/off-ramp production.
3. KYC.
4. Escrow/refund/dispute.
5. Subscription monthly.
6. NFT badge.
7. Livestream platform riêng.
8. Marketplace streamer.
9. AI moderation phức tạp.
10. Tax/accounting report.

## 6. Nguyên tắc kiến trúc

Sản phẩm dùng mô hình hybrid:

```txt
Smart contract = financial settlement layer
Supabase = product database / realtime UX layer
```

### 6.1 On-chain dùng cho

- Creator payout registry.
- Platform fee config.
- Treasury fee address.
- Donation payment routing.
- Fee split.
- Donation event.
- Message hash / donation id hash.

### 6.2 Off-chain dùng cho

- Full message.
- Donor nickname.
- Streamer profile.
- Avatar/banner.
- Overlay theme.
- Recent donations.
- Leaderboard.
- Donation goal.
- Moderation status.
- Dashboard data.
- Stream session metadata.

## 7. Tech Stack

### 7.1 Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Stellar Wallets Kit hoặc Freighter API
- QR code package

### 7.2 Backend

- Next.js API routes hoặc server actions
- Supabase client
- Stellar SDK / RPC client
- Event indexer job

### 7.3 Database / Realtime

- Supabase Postgres
- Supabase Auth
- Supabase Realtime
- Supabase Row Level Security

### 7.4 Blockchain

- Stellar Testnet
- Soroban smart contract viết bằng Rust
- Token interface để transfer asset
- Contract events để backend index

### 7.5 Deploy

- Vercel cho web app
- Supabase hosted project
- Stellar Testnet cho contract

## 8. Kiến trúc tổng quan

```txt
Fan
  ↓ scan QR
Donate Page /donate/[handle]
  ↓ connect wallet
Invoke Soroban contract donate()
  ↓
DonationRouter contract
  ├─ transfer fee → treasury_address
  ├─ transfer net amount → creator_payout_address
  └─ emit DonationReceived event
       ↓
Backend indexer
       ↓
Supabase donations table
       ↓
Supabase Realtime
       ↓
OBS Overlay /overlay/[streamId]
```

## 9. Smart Contract Spec

Tên contract: **DonationRouter**

### 9.1 Vai trò contract

Contract không lưu toàn bộ dữ liệu sản phẩm. Contract chỉ xử lý những dữ liệu cần trust-minimized:

- Ai là creator hợp lệ.
- Creator nhận tiền ở địa chỉ nào.
- Platform fee là bao nhiêu.
- Treasury nhận fee ở đâu.
- Donation được settle như thế nào.
- Event proof của donation.

### 9.2 Global Config

```rust
Config {
    admin: Address,
    treasury_address: Address,
    platform_fee_bps: u32,
    max_fee_bps: u32,
    paused: bool,
}
```

Ghi chú:

- `platform_fee_bps`: phí nền tảng theo basis points.
- `100 = 1%`.
- `max_fee_bps` nên có để tránh admin set fee quá cao.
- Gợi ý MVP: `max_fee_bps = 500`, tức tối đa 5%.

### 9.3 Creator Struct

```rust
Creator {
    owner: Address,
    payout_address: Address,
    active: bool,
}
```

Ghi chú:

- `owner`: địa chỉ có quyền đổi payout address.
- `payout_address`: địa chỉ nhận tiền donate.
- `active`: bật/tắt nhận donate.

### 9.4 Storage

#### Instance Storage

Dùng cho global config:

```txt
admin
treasury_address
platform_fee_bps
max_fee_bps
paused
```

#### Persistent Storage

Dùng cho creator registry:

```txt
creator_id_hash -> Creator
```

#### Không lưu trong storage

```txt
message
donor nickname
donation history list
leaderboard
overlay state
stream metadata
```

Donation history chỉ emit event, backend index về Supabase.

### 9.5 Public Functions

```rust
initialize(
    admin: Address,
    treasury_address: Address,
    platform_fee_bps: u32,
    max_fee_bps: u32
)

register_creator(
    creator_id_hash: BytesN<32>,
    creator_owner: Address,
    payout_address: Address
)

update_creator_payout(
    creator_id_hash: BytesN<32>,
    new_payout_address: Address
)

set_creator_active(
    creator_id_hash: BytesN<32>,
    active: bool
)

set_treasury_address(
    new_treasury_address: Address
)

set_platform_fee_bps(
    new_fee_bps: u32
)

set_paused(
    paused: bool
)

donate(
    creator_id_hash: BytesN<32>,
    token: Address,
    amount: i128,
    donation_id_hash: BytesN<32>,
    message_hash: BytesN<32>
)
```

### 9.6 Authorization Rules

| Function | Authorized by |
|---|---|
| `initialize` | deployer / first caller |
| `register_creator` | admin |
| `update_creator_payout` | creator owner |
| `set_creator_active` | admin hoặc creator owner |
| `set_treasury_address` | admin |
| `set_platform_fee_bps` | admin |
| `set_paused` | admin |
| `donate` | donor address |

### 9.7 Donate Logic

```txt
Input:
- creator_id_hash
- token
- amount
- donation_id_hash
- message_hash

Steps:
1. Check contract is not paused.
2. Check creator exists.
3. Check creator is active.
4. Check amount > 0.
5. Calculate fee_amount = amount * platform_fee_bps / 10_000.
6. Calculate net_amount = amount - fee_amount.
7. Transfer fee_amount from donor to treasury_address.
8. Transfer net_amount from donor to creator.payout_address.
9. Emit DonationReceived event.
```

### 9.8 Events

#### DonationReceived

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
    message_hash: BytesN<32>,
}
```

#### CreatorRegistered

```rust
CreatorRegistered {
    creator_id_hash: BytesN<32>,
    owner: Address,
    payout_address: Address,
}
```

#### CreatorPayoutUpdated

```rust
CreatorPayoutUpdated {
    creator_id_hash: BytesN<32>,
    old_payout_address: Address,
    new_payout_address: Address,
}
```

#### PlatformFeeUpdated

```rust
PlatformFeeUpdated {
    old_fee_bps: u32,
    new_fee_bps: u32,
}
```

#### TreasuryUpdated

```rust
TreasuryUpdated {
    old_treasury_address: Address,
    new_treasury_address: Address,
}
```

## 10. Message Design

### 10.1 Full message không lưu on-chain

Full message lưu trong Supabase vì:

- Cần moderation.
- Có thể chứa nội dung toxic/spam.
- Có thể cần ẩn/xóa khỏi overlay.
- Không nên public vĩnh viễn.
- Không cần contract xử lý nội dung này.

### 10.2 Hash lưu on-chain

Khi fan submit donation:

```txt
message_hash = sha256(donation_id + donor_name + message)
donation_id_hash = sha256(donation_id)
```

Contract chỉ nhận:

```txt
donation_id_hash
message_hash
```

Supabase lưu:

```txt
donation_id
donation_id_hash
donor_name
message
message_hash
```

Lợi ích:

- Message có thể bị ẩn/moderate.
- Vẫn chứng minh được message không bị sửa.
- Có link giữa off-chain record và on-chain event.

## 11. Supabase Schema

### 11.1 creators

```sql
create table creators (
  id uuid primary key default gen_random_uuid(),
  creator_id_hash text unique not null,
  owner_address text not null,
  payout_address text not null,
  handle text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 11.2 streams

```sql
create table streams (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  title text not null,
  goal_amount numeric,
  asset_code text default 'XLM',
  status text default 'active',
  created_at timestamptz default now(),
  ended_at timestamptz
);
```

### 11.3 donations

```sql
create table donations (
  id uuid primary key default gen_random_uuid(),
  donation_id text unique not null,
  donation_id_hash text unique not null,

  creator_id uuid references creators(id) on delete cascade,
  stream_id uuid references streams(id) on delete set null,

  donor_name text,
  message text,
  message_hash text not null,

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
  status text default 'confirmed',

  moderation_status text default 'visible',

  created_at timestamptz default now()
);
```

### 11.4 overlay_settings

```sql
create table overlay_settings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  stream_id uuid references streams(id) on delete cascade,
  alert_duration_ms integer default 6000,
  min_amount numeric default 0,
  sound_enabled boolean default true,
  theme text default 'default',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## 12. App Routes

### 12.1 Public Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/s/[handle]` | Public streamer profile |
| `/donate/[handle]` | Fan donation page |
| `/overlay/[streamId]` | OBS browser source overlay |

### 12.2 Authenticated Routes

| Route | Purpose |
|---|---|
| `/dashboard` | Streamer dashboard |
| `/dashboard/profile` | Edit profile |
| `/dashboard/wallet` | Configure payout address |
| `/dashboard/stream` | Current stream + goal |
| `/dashboard/overlay` | Overlay setup |
| `/dashboard/donations` | Donation history |

### 12.3 API Routes

| Route | Purpose |
|---|---|
| `POST /api/creators` | Create creator profile and register on-chain |
| `POST /api/donations/prepare` | Create off-chain donation draft |
| `POST /api/donations/confirm` | Confirm tx hash and save donation |
| `POST /api/indexer/events` | Ingest contract events |
| `GET /api/creators/[handle]` | Fetch creator profile |
| `GET /api/streams/[id]/leaderboard` | Fetch leaderboard |

## 13. Donation Flow

### 13.1 Streamer Setup

```txt
1. Streamer signs in.
2. Streamer creates profile.
3. Streamer enters Stellar payout address.
4. App creates creator_id.
5. App computes creator_id_hash.
6. App calls contract register_creator.
7. App saves creator profile in Supabase.
8. App generates donate link and QR code.
9. Streamer copies overlay URL into OBS.
```

### 13.2 Fan Donate

```txt
1. Fan scans QR.
2. Fan opens /donate/[handle].
3. Fan enters amount, donor_name, message.
4. App creates donation_id.
5. App computes donation_id_hash.
6. App computes message_hash.
7. Fan connects Stellar wallet.
8. Fan calls contract donate().
9. Contract transfers fee and net amount.
10. Contract emits DonationReceived event.
11. App/backend verifies transaction.
12. Supabase saves full donation record.
13. Overlay receives realtime donation.
14. Alert appears on livestream.
```

### 13.3 Overlay Alert

```txt
1. OBS opens /overlay/[streamId].
2. Overlay subscribes to Supabase Realtime.
3. New confirmed donation arrives.
4. Overlay checks moderation_status = visible.
5. Overlay checks amount >= min_amount.
6. Overlay displays donor_name, amount, asset_code, message.
7. Alert disappears after alert_duration_ms.
```

## 14. Security Considerations

### 14.1 Contract

- Require authorization for admin functions.
- Require creator owner authorization for payout update.
- Check `amount > 0`.
- Enforce `new_fee_bps <= max_fee_bps`.
- Add `paused` emergency switch.
- Avoid storing unbounded donation history.
- Emit events instead of storing arrays.
- Use hash/reference for message.

### 14.2 Backend

- Verify tx hash before marking donation confirmed.
- Verify event matches expected:
  - `creator_id_hash`
  - `donation_id_hash`
  - `message_hash`
  - `amount`
  - `token`
  - `payout_address`
  - `treasury_address`
- Prevent duplicate tx hash.
- Prevent duplicate donation id.
- Sanitize message for overlay.
- Add moderation status.

### 14.3 Frontend

- Escape message output in overlay.
- Limit message length.
- Limit donor name length.
- Display transaction status clearly.
- Do not trust client-only confirmation.

## 15. Realtime / Indexing Strategy

### 15.1 MVP Strategy

After fan submits transaction:

```txt
Frontend receives tx hash
  ↓
POST /api/donations/confirm
  ↓
Backend verifies tx/event
  ↓
Insert donation into Supabase
  ↓
Supabase Realtime notifies overlay
```

### 15.2 More Robust Strategy

Add indexer job:

```txt
Scheduled job polls contract events
  ↓
Find unindexed DonationReceived events
  ↓
Upsert donation records
  ↓
Reconcile pending donations
```

## 16. UI Requirements

### 16.1 Donate Page

Fields:

- Amount buttons: 1, 5, 10, custom.
- Donor name.
- Message.
- Connect wallet button.
- Donate button.
- Transaction status.
- Transaction hash link.

### 16.2 Dashboard

Cards:

- Total donated today.
- Total donated current stream.
- Number of donations.
- Platform fee total.
- Recent donations.
- Top supporters.
- Donation goal progress.
- QR code.
- Overlay URL copy button.

### 16.3 Overlay

Display:

```txt
{donor_name} donated {amount} {asset_code}
"{message}"
```

Behavior:

- Animated entrance.
- Visible for configured duration.
- Queue multiple alerts.
- Ignore hidden/moderated donations.
- Optional sound.

## 17. Demo Script

1. Open streamer dashboard.
2. Show payout address and platform fee config.
3. Show QR code and overlay URL.
4. Open OBS/browser overlay simulation.
5. Scan QR or open donate page.
6. Enter:
   - amount: 5 XLM
   - name: Minh
   - message: Chúc anh win game!
7. Connect Stellar wallet.
8. Submit `donate()` transaction.
9. Show contract event / tx hash.
10. Show dashboard updated.
11. Show overlay alert.
12. Show fee split:
    - fee to treasury;
    - net to streamer payout.

## 18. Success Criteria

MVP được xem là thành công nếu:

- Có smart contract deployed trên Stellar testnet.
- Có thể register streamer với payout address.
- Fan có thể donate thông qua contract.
- Contract tự chia platform fee.
- Contract emit donation event.
- Full message lưu off-chain trong Supabase.
- Dashboard hiển thị donation mới.
- OBS overlay hiển thị alert realtime.
- Có transaction hash/on-chain proof cho mỗi donation.

## 19. Suggested Implementation Order

### Step 1 — Project Setup

- Create Next.js app.
- Configure Tailwind/shadcn.
- Create Supabase project.
- Add Supabase client.
- Add Stellar wallet integration.

### Step 2 — Database

- Create tables:
  - creators
  - streams
  - donations
  - overlay_settings
- Enable RLS later after prototype works.

### Step 3 — Smart Contract

- Implement `initialize`.
- Implement `register_creator`.
- Implement `set_platform_fee_bps`.
- Implement `set_treasury_address`.
- Implement `update_creator_payout`.
- Implement `donate`.
- Emit events.

### Step 4 — Donate Flow

- Build donate page.
- Build message hashing.
- Connect wallet.
- Invoke contract.
- Confirm tx.

### Step 5 — Dashboard

- Show streamer profile.
- Show QR.
- Show recent donations.
- Show totals.
- Show goal.

### Step 6 — Overlay

- Build transparent overlay page.
- Subscribe to Supabase Realtime.
- Render alert.
- Add queue.

### Step 7 — Polish

- Better UI.
- Error states.
- Loading states.
- Demo data.
- README.
- Pitch deck/video.

## 20. Core Pitch

> StreamTip Stellar is a QR-based live tipping app for streamers. Fans can donate through Stellar smart contracts, messages appear instantly on livestream overlays, and every donation has transparent on-chain proof. The contract handles the financial layer — creator payout, platform fee, and event proof — while Supabase powers the off-chain consumer experience like messages, dashboards, leaderboards, and moderation.

## 21. Final Design Decision

The app should not put all data on-chain.

Correct split:

```txt
On-chain:
- platform fee
- treasury address
- creator payout address
- donation settlement
- donation event
- message hash

Off-chain:
- full message
- donor name
- streamer profile
- overlay UX
- leaderboard
- donation goal
- moderation
```

This keeps the product simple, demo-friendly, and technically appropriate for a hackathon requiring smart contracts.
