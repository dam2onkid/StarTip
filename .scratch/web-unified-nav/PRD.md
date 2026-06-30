Status: ready-for-agent

# PRD — Unified hybrid navigation

## Problem Statement

StarTip's web app has two disjoint navigation surfaces: a marketing nav
(`SiteNav` inside `LandingShell`) that only renders on the landing page, and a
minimal header inside the `(auth)` route group's `layout.tsx` that only renders
on `/dashboard`. Every other public route (`/creator/explore`, `/creator/[handle]`,
`/creator/[handle]/donate`, `/docs`, `/login`, `/signup`) has no nav at all. The
two surfaces share no component, no auth awareness, and no visual language.

A grilling session (using the `domain-modeling` skill) settled the target shape:
a single hybrid nav rendered in the root layout so it appears on every page
except the OBS Overlay (`/overlay/*`, which must stay transparent and chrome-free
for browser-source composition). The nav adapts its right cluster to the Supabase
session: unauthenticated visitors see a Donate Wallet connector plus a
"Become a Creator" CTA; authenticated users see the same Donate Wallet connector
plus a static notification bell and an avatar menu (Dashboard, Logout). The left
side is identical in both states: the StarTip logo and a single "Discover" link
to `/creator/explore`. The XP/gamification badge, theme toggle, "Partner with us",
"Stellar Ambassadors", and "Blog" items from the visual reference are dropped.

A new domain term was added to `CONTEXT.md` during the session: **Donate Wallet**,
the browser wallet connected via the Stellar Wallets Kit, used to sign `donate()`.
It is distinct from the existing **Owner Address** (a Creator's persistent on-chain
identity stored in `profiles.owner_address` and managed inside the dashboard
creator settings). The nav never surfaces the Owner Address; it only surfaces the
Donate Wallet.

## Solution

Build the unified nav as three vertical slices, each cutting through layout,
component, auth/wallet wiring, and tests:

1. **Hoist nav to root layout, isolate overlay, finalize left links.** Move nav
   rendering from `LandingShell` into `app/layout.tsx` so it renders on every
   page. Remove the `(auth)/layout.tsx` header. Suppress the nav on `/overlay/*`
   routes (overlay uses a layout that skips the nav, or the nav hides itself
   based on the current pathname). Replace the left links ("How it works",
   "Built on Stellar" scroll-spy anchors) with the final shape: Logo + "Discover"
   linking to `/creator/explore`. Keep the existing "Become a Creator" CTA in
   the right cluster for now; it is reworked in slice 3. Update existing E2E
   tests to match the new link targets and nav presence on every public page.

2. **Donate Wallet connector in nav.** Add a wallet pill to the right cluster,
   always visible in both auth states. Disconnected: "Connect wallet" button
   calls `connectWallet()` from `lib/wallet/kit.ts`. Connected: a truncated
   address pill opens a dropdown with "Copy address", "View on Stellar"
   (Stellar Expert URL), and "Disconnect" (calls `disconnectWallet()`). Wallet
   state is tracked client-side via the kit. This slice reuses the existing kit
   and its test stub seam; no new API routes, no new schema, no `owner_address`
   involvement. Unit tests for the pill states; E2E for connect/copy/disconnect
   using the existing wallet stub harness.

3. **Auth-aware right cluster (CTA / bell + avatar menu).** The root layout
   resolves the Supabase session server-side and passes auth state plus the
   caller's Profile (display_name, email, avatar_url) to the nav. Unauthenticated:
   show the "Become a Creator" CTA linking to `/signup` alongside the wallet pill
   from slice 2. Authenticated: replace the CTA with a static notification bell
   (icon opens an empty-state dropdown) and an avatar menu showing display_name +
   email as a header, then "Dashboard" (links to `/dashboard`) and "Logout"
   (reuses the Supabase `signOut` logic from the existing `LogoutButton`,
   navigates to `/login`). E2E covers the unauth CTA, the auth avatar menu, and
   the logout flow.

The three slices are published in dependency order so each issue can reference
real issue identifiers in its "Blocked by" field.

## User Stories

### Unified nav shell

1. As a visitor, I want a consistent nav on every page (except the OBS Overlay),
   so I can navigate the site from anywhere.
2. As a visitor, I want "Discover" in the nav, so I can find creators to donate
   to.
3. As a developer, I want the nav rendered in the root layout, so that every
   route inherits it without per-layout wiring.

### Donate Wallet connector

4. As a donor, I want to connect my wallet from the nav, so I can donate without
   navigating to a separate page.
5. As a connected donor, I want to see my wallet address in the nav, so I know
   which wallet I am donating from.
6. As a connected donor, I want to copy my address, view it on Stellar, and
   disconnect, all from the nav.

### Auth-aware right cluster

7. As an unauthenticated visitor, I want a "Become a Creator" CTA in the nav, so
   I can sign up.
8. As an authenticated user, I want my avatar in the nav, so I can reach my
   dashboard and log out.
9. As an authenticated user, I want a notification bell in the nav, so I know
   where notifications will appear.

## Out of scope

- Owner Address management (link/unlink wallet from the Creator Profile). This
  stays inside the dashboard creator settings, surfaced via the existing
  `signMessage` flow and `/api/wallet/link` routes.
- Real notification events. The bell is a static placeholder with an empty-state
  dropdown.
- Theme toggle. The Graphite design system is dark-only.
- Gamification (XP/CP) badges.
- Profile and Settings as separate destination pages. Both avatar menu items
  resolve to `/dashboard` for now.

## Boundaries

The nav is a presentation surface only. It reads the Supabase session and the
browser-connected wallet address; it does not write to `profiles.owner_address`,
does not call `donate()`, and does not subscribe to Supabase Realtime. All
domain writes stay in their existing surfaces (dashboard, donate flow).
