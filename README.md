# StarTip

![StarTip logo](apps/web/public/logo.png)

StarTip is a QR-based live tipping app built on the Stellar network. Fans donate Stellar assets to creators through a Soroban smart contract (`DonationRouter`) that splits the platform fee and sends the rest directly to the creator's payout address. Supabase powers the off-chain experience: profiles, donation history, creator dashboards, moderation, and the real-time overlay for streaming tools such as OBS.

**Demo:** [https://startip.up.railway.app](https://startip.up.railway.app)

## Overview

- **Creators** claim a unique handle, link a Stellar wallet, and set a payout address. Once registered on-chain, they get a public donation page (`/donate/[handle]`) and a private overlay URL (`/overlay/[overlay_id]`).
- **Donors** open a creator's link, pick a token from the allowlist, enter an amount, and sign one transaction. The donation settles in seconds and an alert appears on the creator's overlay.
- **Overlay** is a browser-source page that plays sound and text-to-speech alerts when new donations are mirrored by the indexer.
- **Donation goals** let creators set a target amount for a token and display progress on the overlay.
- **Moderation** allows creators to review and hide messages attached to donations.

## Architecture

```
StarTip
├── apps
│   ├── web                 # Next.js 16 application (marketing, dashboard, donate pages, API routes)
│   └── worker              # Hono/Node.js worker (donation verification, TTS, indexer polling)
├── packages
│   └── shared              # Shared library: Supabase clients, Stellar helpers, indexer, donations
├── contracts
│   └── donation-router     # Soroban Rust smart contract (fee split, creator registry, token allowlist)
└── supabase/migrations     # Database schema and RLS policies
```

### Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, Lenis
- **Backend**: Next.js API routes, Hono worker, Supabase (Postgres + Auth + Realtime + Storage)
- **Blockchain**: Stellar Testnet, Soroban, `@stellar/stellar-sdk`, Stellar Wallets Kit
- **Smart contract**: Rust + `soroban-sdk`
- **Monorepo**: pnpm workspaces, Turbo 2
- **Testing**: Vitest, Playwright, jsdom

### DonationRouter contract

| Network | Contract address                                           |
| ------- | ---------------------------------------------------------- |
| Testnet | `CDPGM5VIYTMUINLQGUMCLI7VJ2BX3UCOLZWMUTTKDGHUZXBPLNO3V76K` |

The contract is configured from the environment:

- Web app: `NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`
- Worker: `DONATION_ROUTER_CONTRACT_ID`

The current deployment uses a 1% platform fee (`100 bps`) with a 5% max fee cap (`500 bps`).

For a detailed explanation of the contract mechanics, see the [donation-router README](./contracts/donation-router/README.md).

## Local setup

### Prerequisites

- Node.js 20+ and pnpm 11.5.0 (recommended: `corepack enable` or `npm i -g pnpm@11.5.0`)
- Rust 1.91.0+ with `cargo` and `wasm32v1-none` target
- Stellar CLI (`stellar`) with a testnet identity and funded account
- Docker (for contract integration tests)
- A Supabase project (local or cloud) with Auth, Realtime, and Storage enabled

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
```

Fill in both files:

- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (web)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `WORKER_URL` (web) and `WORKER_SECRET` (web + worker)
- `DONATION_ROUTER_CONTRACT_ID` (worker) and `NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID` (web) - use the Testnet address above
- `STELLAR_RPC_URL` and `STELLAR_NETWORK_PASSPHRASE` in the worker

### 3. Run Supabase migrations

Apply the SQL files in `apps/web/supabase/migrations/` to your Supabase project. The order is encoded in the filename timestamps. Key tables: `profiles`, `donations`, `tokens`, `indexer_state`, `overlay_settings`, `donation_goals`.

### 4. Build the smart contract (optional for local contract work)

```bash
pnpm contracts:build
```

Run unit tests:

```bash
pnpm contracts:test
```

Run integration tests (requires Docker):

```bash
pnpm contracts:integration
```

### 5. Start the worker

```bash
pnpm --filter @startip/worker dev
```

The worker runs on `http://localhost:3101` by default.

### 6. Start the web app

```bash
pnpm --filter web dev
```

The web app runs on `http://localhost:3000`.

### 7. Useful commands

```bash
# Run type checks across the monorepo
pnpm typecheck

# Run lint
pnpm lint

# Run tests
pnpm test

# Build everything
pnpm build
```

## Project structure

### `apps/web`

Next.js app with the following route groups:

- `(public)` - landing page, creator donation page, overlay, docs, login/signup
- `(auth)` - creator dashboard, donor history, moderation, settings
- `api` - proxy routes for TTS, donation verification, wallet link, overlay settings

Key libraries:

- `lib/donations` - donation flow, trustline checks, amount conversion
- `lib/stellar` - RPC client, network config, wallet kit
- `lib/supabase` - browser and server clients
- `lib/overlay` - overlay settings and alert filtering

### `apps/worker`

Background worker written with Hono:

- `/verify` - confirms a donation transaction on-chain and upserts it to Supabase
- `/tts` and `/tts/voices` - Microsoft Edge TTS synthesis and voice listing
- indexer loop - polls Soroban RPC for `DonationReceived` events and dispatches them to Supabase

### `packages/shared`

Internal package shared by `web` and `worker`:

- `supabase` - typed client factories and database types
- `stellar` - network helpers and amount formatting
- `indexer` - event parsing and dispatch logic
- `donations` - verification helpers
- `profiles` - profile/overlay helpers

### `contracts/donation-router`

Soroban Rust contract ([detailed README](./contracts/donation-router/README.md)):

- Creator registration and payout address updates
- Token allowlist management
- `donate()` with fee split, net transfer, and event emission
- Admin controls: pause, fee settings, treasury, force-pause creator

## Notes

- The app currently targets **Stellar Testnet**. Switching to pubnet requires updating the contract address, network passphrase, and RPC URLs.
- The overlay uses `window.__STARTIP_OVERLAY_REALTIME_STUB__` as a test seam for automated testing.
- The contract stores amounts in the token's smallest divisible unit (raw i128). The UI converts to display units using the token's `decimals` from the `tokens` table.
