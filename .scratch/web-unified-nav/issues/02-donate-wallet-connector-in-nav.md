Status: ready-for-agent

## Parent

`.scratch/web-unified-nav/PRD.md`

## What to build

Add a Donate Wallet connector to the nav's right cluster. The connector is
always visible in both auth states (unauthenticated and authenticated) and
never requires login. It surfaces the browser wallet connected via the Stellar
Wallets Kit (`lib/wallet/kit.ts`), not the Creator's Owner Address (which is a
separate domain concept managed inside the dashboard creator settings).

Disconnected state: a "Connect wallet" button that calls `connectWallet()` from
`lib/wallet/kit.ts`. On success the pill transitions to the connected state.

Connected state: a pill showing the truncated connected address (e.g.
`GABCD…WXYZ`). Clicking the pill opens a dropdown menu with three items:

- **Copy address** — copies the full address to the clipboard.
- **View on Stellar** — links to the address page on Stellar Expert (testnet vs
  pubnet chosen from the existing `networkPassphrase` in `lib/stellar/client`).
- **Disconnect** — calls `disconnectWallet()` and returns the pill to the
  disconnected state.

Wallet state is tracked client-side via the kit. No new API routes, no new
Supabase schema, no `profiles.owner_address` reads or writes. Reuse the existing
kit functions and the existing `window.__STARTIP_WALLET_STUB__` test seam so
unit tests run without the heavy browser-only kit and E2E can drive connect /
disconnect deterministically.

The connector sits in the right cluster alongside the existing "Become a Creator"
CTA (the CTA's auth-aware behavior lands in slice 3). Visual treatment follows
`DESIGN.md`: the pill is a glass surface with the lime accent reserved for the
Connect CTA's resting or hover state (single-accent rule).

Unit tests cover the disconnected and connected states, the address truncation,
and the three menu actions (Copy uses a mocked clipboard, View on Stellar
asserts the href, Disconnect asserts `disconnectWallet` is called and the pill
reverts). E2E covers the connect / copy / view / disconnect flow using the
wallet stub harness.

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] A Donate Wallet connector renders in the nav right cluster on every
      non-overlay page, in both auth states.
- [ ] Disconnected state shows a "Connect wallet" button that calls
      `connectWallet()` and transitions to the connected state on success.
- [ ] Connected state shows a pill with the truncated connected address.
- [ ] The connected pill's dropdown menu contains "Copy address", "View on
      Stellar", and "Disconnect".
- [ ] "Copy address" copies the full address to the clipboard.
- [ ] "View on Stellar" links to the correct Stellar Expert URL for the active
      network (testnet vs pubnet).
- [ ] "Disconnect" calls `disconnectWallet()` and the pill reverts to the
      disconnected state.
- [ ] The connector never reads or writes `profiles.owner_address`.
- [ ] Unit tests cover the disconnected state, connected state, truncation, and
      the three menu actions.
- [ ] E2E covers the connect / copy / view / disconnect flow using the wallet
      stub harness.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-unified-nav/issues/01-hoist-nav-isolate-overlay-finalize-left-links.md`
