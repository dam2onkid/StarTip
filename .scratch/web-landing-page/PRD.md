Status: ready-for-agent

# PRD — Web project setup and landing page

## Problem Statement

StarTip has a validated spec (`docs/specs.md`), a domain glossary (`CONTEXT.md`),
a design system (`design.md`), four ADRs, and a `donation-router` Soroban contract
under development, but no web application exists yet. The demo script (spec §17)
begins with "Open the landing page, click 'Become a Creator'", and every public,
donor, dashboard, overlay, and API route in spec §12 needs a Next.js app to live
in. Without the web project there is no consumer surface for the contract, no
landing page for the hackathon judge to land on, and no scaffold for the
onboarding, donate, overlay, and dashboard features to be built into.

This PRD covers the foundation: initializing the `web/` Next.js project, wiring
the styling and tooling stack, scaffolding the route groups, and implementing the
landing page (`/`) end-to-end. The onboarding wizard, donate page, overlay,
dashboard, and API routes are separate features that will be built on top of this
scaffold and are out of scope here.

## Solution

Initialize a Next.js App Router project at `web/` in the repo root, configured as
a pnpm workspace package. Wire Tailwind v4 with shadcn/ui stripped to dark-only,
mapping the Graphite design system (`design.md`) onto shadcn's token layer.
Scaffold the App Router route groups `(public)`, `(auth)`, and `(api)` per spec
§12, with a Supabase middleware guard stub for `(auth)`. Set up the shared
library layout (`lib/stellar` server/client split, `lib/supabase` ssr split,
`lib/env` validated via `@t3-oss/env-nextjs`) so subsequent features inherit the
correct seams without re-litigating them.

Implement the landing page (`/`) as a hub plus Creator-marketing page: a hero
with the headline "Fast, global tips for livestream creators. Settled on
Stellar.", a single primary CTA "Become a Creator" linking to `/onboarding`,
three secondary cards (Open Dashboard, Find a Creator, How donating works), a
three-step "How it works" section animated with Framer Motion staggered reveals
over Lenis smooth scroll, and a "Built on Stellar" section highlighting fast
settlement, global access, and low fee as MVP-true claims, with cross-border
cash-out noted as a Stellar ecosystem roadmap capability rather than an MVP
feature. The page respects `design.md`'s single-accent rule (one primary
tertiary CTA per route/view at rest, hover state shifts permitted),
flat-no-gradient rule, and negative-space aesthetic. Motion is gated behind
`prefers-reduced-motion`.

## User Stories

### Project scaffold

1. As a developer, I want a Next.js App Router project at `web/` in the repo
   root, so that the web app is isolated from the `contracts/` Cargo workspace
   and the root stays clean for domain docs.
2. As a developer, I want `web/` declared as a pnpm workspace package via
   `pnpm-workspace.yaml` at the repo root, so that the project is ready to scale
   to additional JS packages without reconfiguring.
3. As a developer, I want TypeScript configured with the path alias `@/*`
   pointing to `./src/*`, so that imports match the Stellar `dapp` skill's
   `@/lib/stellar` and `@/hooks/useFreighter` conventions.
4. As a developer, I want `app/`, `lib/`, `components/`, and `hooks/` colocated
   under `src/`, so that the root of `web/` stays limited to config files.
5. As a developer, I want `lib/stellar` split into `server.ts` (RPC and Horizon
   instances, server-only) and `client.ts` (network passphrase, contract ID,
   client-safe), so that the ~200KB `@stellar/stellar-sdk` bundle is not shipped
   to routes that do not need it (landing, overlay, profile).
6. As a developer, I want environment variables validated at build time via
   `@t3-oss/env-nextjs` with separate `server`, `client`, and `runtimeShared`
   schemas, so that a missing or mis-prefixed variable fails the build instead of
   surfacing as a cryptic runtime error.
7. As a developer, I want `NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`,
   `NEXT_PUBLIC_STELLAR_NETWORK`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exposed to
   the client, so that the donate flow can build transactions without a server
   round-trip for contract ID lookup.
8. As a developer, I want `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` kept
   server-only, so that the service role key can never be bundled into a client
   component by accident.
9. As a developer, I want `pnpm build` and `pnpm typecheck` to pass on a clean
   install, so that the scaffold is verified before any feature work lands.
10. As a developer, I want the Supabase CLI initialized at `web/supabase/` with
    an empty `migrations/` directory and a `config.toml`, so that subsequent
    schema work has the local-development workflow ready (per Supabase MCP
    guidance: prefer local before remote).

### Routing and layout

11. As a developer, I want App Router route groups `(public)`, `(auth)`, and
    `(api)` set up under `src/app/`, so that public, authenticated, and API
    routes are visually and logically separated.
12. As a developer, I want a `middleware.ts` at `web/src/middleware.ts` that
    refreshes the Supabase session and redirects unauthenticated requests from
    `(auth)/*` to the Supabase Auth login flow, so that dashboard and onboarding
    routes are guarded at the edge without loading their React bundles for
    unauthenticated visitors.
13. As a developer, I want a `src/lib/supabase/server.ts` exporting
    `createServerClient` (RSC and route handler use) and a
    `src/lib/supabase/client.ts` exporting `createBrowserClient` (client
    component use, anon key for overlay, user JWT for dashboard), so that the
    `@supabase/ssr` official pattern is wired once and reused.
14. As a developer, I want a root `src/app/layout.tsx` that sets `class="dark"`
    on the `html` element, loads Inter Tight and Inter and JetBrains Mono via
    `next/font`, and wraps children in a minimal Providers component, so that
    the dark-only Graphite theme and typography are applied app-wide without a
    light theme ever shipping.
15. As a developer, I want the `(auth)` group to have a `layout.tsx` placeholder
    for a shared dashboard navigation shell, so that subsequent dashboard pages
    inherit the nav without per-page setup.

### Styling

16. As a developer, I want Tailwind v4 installed and configured with shadcn/ui
    via `pnpm dlx shadcn@latest init`, so that component primitives (Button,
    Card, etc.) are available and the `components.json` registry is set up.
17. As a developer, I want the Graphite design tokens from `design.md` mapped
    onto shadcn's CSS variable layer (`--background` = `#0E1013`, `--card` =
    `#17191C`, `--primary` = `#B4FF39`, `--foreground` = `#ECEDEE`,
    `--muted-foreground` = `#9CA3AF`), so that `design.md` remains the source of
    truth and shadcn components render in the Graphite palette by default.
18. As a developer, I want the shadcn light theme stripped entirely (no `.light`
    class, no light token values), so that the single-accent dark system is the
    only system the app ships.
19. As a developer, I want shadcn's default hover background shift retained on
    the primary CTA, so that the button has tactile affordance (per the updated
    `design.md` Do's and Don'ts: the single-accent rule applies to resting
    state, interaction feedback is permitted).
20. As a developer, I want no gradients, no glassmorphism, no noise overlays, no
    custom cursor, no magnetic components, and no 3D introduced, so that the
    "flat on purpose" rule in `design.md` is respected even while motion is
    added.
21. As a developer, I want the JetBrains Mono font applied to label-style text
    (step numbers, card headers), Inter Tight to headlines, and Inter to body,
    so that the typography hierarchy in `design.md` is reflected in code.

### Landing page content and structure

22. As a hackathon judge, I want the landing page headline to read "Fast, global
    tips for livestream creators. Settled on Stellar.", so that I understand the
    product's value proposition and the rail it runs on within five seconds.
23. As a hackathon judge, I want a subheadline explaining that fans scan a QR,
    the transaction settles in seconds anywhere for a fraction of a cent, and
    every donation is bound to an on-chain proof the platform cannot forge, so
    that I understand the mechanism without scrolling.
24. As a Creator, I want a single primary CTA labeled "Become a Creator" that
    links to `/onboarding`, so that I can begin the registration flow from the
    landing page (per demo script spec §17 step 1).
25. As a returning Creator, I want a secondary card "Already a Creator?" with a
    link to `/dashboard`, so that I can return to my dashboard without going
    through onboarding.
26. As a Donor, I want a secondary card "Here to tip?" explaining I can scan a
    QR or look up a Creator by handle, so that I understand the donation entry
    path even though I arrive via the landing page rather than a QR.
27. As a hackathon judge, I want a secondary card "How it works" with a "See
    the flow" link that scrolls to the How it works section, so that I can read
    the donation flow summary in one place.
28. As a hackathon judge, I want a "How it works" section with three numbered
    steps (01 Register, 02 Share, 03 Receive) each explaining one phase of the
    Creator journey, so that I understand the end-to-end product flow before
    the demo.
29. As a hackathon judge, I want a "Built on Stellar" section with three value
    props (Fast, Global, Low fee) each backed by a specific claim (settle in
    seconds, any wallet any country, fraction of a cent per transaction), so
    that I understand why Stellar was chosen as the rail.
30. As a hackathon judge, I want the cross-border cash-out capability noted as
    a Stellar ecosystem roadmap item rather than an MVP feature, so that I am
    not misled about what the MVP ships.
31. As a reader, I want the page copy to use the domain vocabulary from
    `CONTEXT.md` (Creator, Donor, Donation, Handle, Payout Address, Platform
    Fee, Overlay), so that the landing page is consistent with the rest of the
    product surface and docs.

### Motion and accessibility

32. As a visitor, I want the three "How it works" steps to reveal with a
    staggered fade-and-translate-up animation as they enter the viewport, so
    that the section feels premium without violating the flat design language.
33. As a visitor, I want smooth scrolling via Lenis across the landing page, so
    that the scroll-driven reveal feels continuous.
34. As a visitor who has set `prefers-reduced-motion: reduce` in my OS, I want
    all Framer Motion reveals and Lenis smooth scrolling disabled, so that the
    page renders statically without motion (per `premium-frontend-ui` skill §5
    accessibility guardrail).
35. As a developer, I want a `NEXT_PUBLIC_LENIS_DISABLED` env flag (or
    equivalent) so that I can disable Lenis smooth scrolling during fast demo
    runs without removing the code, in case the scroll hijack feels sticky to
    the judge.
36. As a visitor on a touch device, I want hover-only interactions to be gated
    behind `@media (hover: hover) and (pointer: fine)`, so that the page does
    not ship hover logic that breaks on touch (per `premium-frontend-ui` skill
    §5 responsive degradation).

### Performance

37. As a developer, I want the landing page to be a Server Component by default
    with client islands only for the Framer Motion and Lenis portions, so that
    the first paint is server-rendered and the JS bundle for `/` stays minimal.
38. As a developer, I want Framer Motion and Lenis dynamically imported on the
    client only, so that they do not bloat the server bundle or the initial
    client bundle for the static hero and cards.
39. As a developer, I want only `transform` and `opacity` animated (never
    `width`, `height`, `top`, `margin`), so that the motion stays on composited
    layers and does not trigger layout recalculation (per
    `premium-frontend-ui` skill §5 hardware acceleration guardrail).

### SEO and metadata

40. As a search engine, I want the landing page to ship a `<title>` of "StarTip
    — Fast, global tipping for livestream creators, settled on Stellar" and a
    meta description matching the subheadline, so that the page is indexed with
    the correct product framing.
41. As a developer, I want OpenGraph and Twitter card metadata generated from
    the same copy, so that link previews on social and judge chat channels
    render the product name and tagline.

## Implementation Decisions

- **Project location.** A new `web/` directory at the repo root, declared as a
  pnpm workspace package via a new `pnpm-workspace.yaml` at the repo root
  containing `packages: [web]`. The `contracts/` Cargo workspace is unaffected.
  The root `package.json` is a workspace root only; `web/package.json` holds the
  app dependencies. This is reversible via `git mv` and is not recorded as an
  ADR.

- **Framework.** Next.js App Router with React Server Components as the default
  rendering mode. Client components are opted into explicitly with
  `"use client"`. Pages Router is not used. This matches the `dapp` and
  `vercel-react-best-practices` skills, both of which are Next.js App
  Router-first.

- **Package manager.** pnpm, no Turborepo. The workspace config is one line and
  scales to additional JS packages later without adding an orchestration layer.

- **TypeScript and path alias.** `tsconfig.json` generated by `create-next-app`,
  with `paths: { "@/*": ["./src/*"] }`. All app code lives under `web/src/`:
  `src/app/`, `src/lib/`, `src/components/`, `src/hooks/`.

- **Styling stack.** Tailwind v4 initialized via `create-next-app`'s Tailwind
  flag, then shadcn/ui initialized via `pnpm dlx shadcn@latest init` from within
  `web/`. The shadcn `components.json` is configured to use the `src/` style and
  the `@/*` alias. The Graphite tokens from `design.md` are mapped onto shadcn's
  CSS variable layer in the global stylesheet:

  - `--background` = `#0E1013` (Neutral)
  - `--card` = `#17191C` (Surface)
  - `--primary` = `#B4FF39` (Tertiary, the single accent)
  - `--foreground` = `#ECEDEE` (Primary text)
  - `--muted-foreground` = `#9CA3AF` (Secondary text and borders)
  - `--radius` values from `design.md` (`sm: 6px`, `md: 10px`, `lg: 14px`)

  The light theme is stripped: no `.light` class, no light token values. The
  root `html` element has `class="dark"` set permanently. shadcn's default hover
  background shift on the primary button is retained; the single-accent rule
  applies to resting state only, as captured in the updated `design.md` Do's and
  Don'ts. No gradients, no glassmorphism, no noise overlays, no custom cursor, no
  magnetic components, no 3D.

- **Typography.** Fonts loaded via `next/font`: Inter Tight for display and h1,
  Inter for body, JetBrains Mono for labels. The `next/font` setup uses the
  Google Fonts source for each family and exposes CSS variables
  (`--font-display`, `--font-body`, `--font-label`) consumed by Tailwind's
  `font-family` utilities.

- **Route groups.** Under `src/app/`:

  - `(public)/` holds `page.tsx` (the landing page), `s/[handle]/page.tsx`,
    `donate/[handle]/page.tsx`, and `overlay/[handle]/page.tsx`. Only the landing
    page is implemented in this PRD; the other three are stubs that render a
    placeholder so the route groups exist for subsequent features.
  - `(auth)/` holds `onboarding/page.tsx` and `dashboard/` (with `layout.tsx`
    and the six dashboard sub-routes from spec §12.2). All are stubs except the
    shared `layout.tsx` which renders a minimal nav shell placeholder.
  - `api/` holds the route handler stubs from spec §12.3
    (`creators/route.ts`, `wallet/link/route.ts`, `donations/prepare/route.ts`,
    `donations/confirm/route.ts`, `indexer/poll/route.ts`,
    `creators/[handle]/route.ts`). Each returns a 501 Not Implemented with a
    JSON body `{ error: "not_implemented" }` so the route shape is locked
    without implementing behavior.

- **Middleware.** `src/middleware.ts` uses `@supabase/ssr`'s `updateSession`
  helper to refresh the Supabase JWT on every request and redirect
  unauthenticated requests matching the `(auth)` matcher to the Supabase Auth
  login flow. The matcher excludes `api/`, `_next/`, and static assets. The
  actual login redirect target is a placeholder constant; the Supabase Auth
  client is wired but no login UI is implemented in this PRD.

- **Supabase client split.** `src/lib/supabase/server.ts` exports
  `createServerClient` for use in RSC and route handlers (reads cookies via
  `next/headers`). `src/lib/supabase/client.ts` exports `createBrowserClient`
  for use in client components (overlay Realtime with anon key, dashboard
  mutations with user JWT). Both read their URL and keys from the validated env
  module.

- **Stellar client split.** `src/lib/stellar/server.ts` exports `rpc` and
  `horizon` instances for server-side use (route handlers, RSC data fetching).
  `src/lib/stellar/client.ts` exports the network passphrase, contract ID, and
  a lazily-initialized `rpc` instance for client-side transaction building
  (donate flow). The server module is marked server-only via
  `import "server-only"` so it cannot be bundled into a client component by
  accident.

- **Env validation.** `src/lib/env.ts` uses `@t3-oss/env-nextjs` to declare and
  validate:

  - `server`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `client`: `NEXT_PUBLIC_STELLAR_NETWORK` (default `"testnet"`),
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`,
    `NEXT_PUBLIC_LENIS_DISABLED` (optional, default `"false"`)
  - `runtimeShared`: none beyond the client set.

  A missing required variable throws at build time. The module is the single
  source of env access; no other module reads `process.env` directly for these
  keys.

- **Landing page structure.** `src/app/(public)/page.tsx` is a Server Component
  that renders four sections in order:

  1. Hero: headline, subheadline, primary CTA "Become a Creator" linking to
     `/onboarding`.
  2. Secondary cards: a three-card grid (Open Dashboard → `/dashboard`, Find a
     Creator → scroll to a finder explainer or `/s/[handle]` placeholder, How
     donating works → scroll to the How it works section).
  3. How it works: three numbered steps (01 Register, 02 Share, 03 Receive),
     each with a label in JetBrains Mono and one sentence of body copy. This
     section is a client component (`"use client"`) because it uses Framer
     Motion `whileInView` for the staggered reveal.
  4. Built on Stellar: three value props (Fast, Global, Low fee) plus a roadmap
     note about cross-border cash-out. Static Server Component.

  The hero, secondary cards, and Built on Stellar sections are Server
  Components. Only the How it works section (and the Lenis smooth-scroll wrapper)
  are client components.

- **Motion.** Framer Motion is used for the staggered step reveal
  (`whileInView` with `opacity: 0 → 1` and `y: 16 → 0`, staggered by 120ms).
  Lenis is used for smooth scrolling across the page, initialized in a client
  component that wraps the page body. Both are dynamically imported on the
  client so they do not enter the server bundle. The entire motion layer is
  gated behind `@media (prefers-reduced-motion: no-preference)`: when the user
  has set `prefers-reduced-motion: reduce`, Framer Motion renders the steps
  statically (no `whileInView`) and Lenis is not initialized. A
  `NEXT_PUBLIC_LENIS_DISABLED` env flag additionally allows disabling Lenis at
  build time for demo runs where scroll hijack feels sticky. Only `transform`
  and `opacity` are animated.

- **Copy.** The landing page copy is locked from the grilling session:

  - Headline: "Fast, global tips for livestream creators. Settled on Stellar."
  - Subheadline: "Fans scan a QR and send a Stellar asset. The transaction
    settles in seconds, anywhere in the world, for a fraction of a cent. Every
    donation is bound to an on-chain proof the platform cannot forge."
  - Primary CTA: "Become a Creator" → `/onboarding`.
  - Card 1 header: "Already a Creator?" body: "View your donations, moderate
    messages, and configure your overlay." CTA: "Open Dashboard" → `/dashboard`.
  - Card 2 header: "Here to tip?" body: "Scan a QR from the stream, or look up
    a Creator by handle." CTA: "Find a Creator".
  - Card 3 header: "How it works" body: "A donor scans, picks a Stellar asset,
    signs one transaction. The contract splits the fee, settles in seconds, and
    emits proof. The overlay shows the alert." CTA: "See the flow" → scroll to
    How it works.
  - Step 01 Register: "Create a profile, link your Stellar wallet, and register
    on-chain. The contract binds your handle to your payout address."
  - Step 02 Share: "Get a donate link and QR. Drop the QR on your stream. Add
    the overlay URL to OBS."
  - Step 03 Receive: "Fans donate. The contract settles in seconds, the overlay
    alerts, your dashboard tracks every tip with on-chain proof."
  - Built on Stellar Fast: "Transactions settle in seconds on a ledger built
    for payments. No waiting on block confirmations, no stuck transfers."
  - Built on Stellar Global: "Any wallet, any country. A donor in Tokyo and a
    creator in Hanoi settle on the same ledger in the same block."
  - Built on Stellar Low fee: "A fraction of a cent per transaction. The
    platform takes a bounded fee, on-chain and capped. The rest reaches the
    creator."
  - Roadmap note: "Stellar's anchor network enables cross-border cash-out to
    local currencies in 180+ countries. StarTip's MVP settles on Testnet; fiat
    off-ramp integration is on the roadmap."
  - Page title: "StarTip — Fast, global tipping for livestream creators,
    settled on Stellar".
  - Meta description: matches the subheadline.

  Copy uses the domain vocabulary from `CONTEXT.md` (Creator, Donor, Donation,
  Handle, Payout Address, Platform Fee, Overlay). No exclamation points. Active
  voice throughout. No fabricated statistics beyond the Stellar network facts
  (seconds settlement, fraction of a cent fee, 180+ countries via anchor
  network).

- **Wallet provider.** Not wired in this PRD. The wallet provider (Stellar
  Wallets Kit V2) will be added to `(auth)/onboarding`,
  `(auth)/dashboard/wallet`, `(auth)/dashboard/payout`, and
  `(public)/donate/[handle]` layouts in their respective feature PRDs. The
  scaffold does not install the wallet kit dependency yet, to keep the landing
  page bundle clean.

- **Supabase CLI.** `web/supabase/` is initialized with `supabase init`,
  producing `config.toml` and an empty `migrations/` directory. No migrations
  are written in this PRD. The local stack is not started in this PRD; that
  belongs to the schema feature.

## Testing Decisions

- **What makes a good test here.** A good test exercises the landing page's
  external behavior: what renders, where the links point, what theme is applied,
  and whether motion respects the reduced-motion preference. It does not test
  implementation details (component internals, Tailwind class names, Framer
  Motion variant objects, shadcn token variable names). A test that needed to
  know the internal CSS variable mapping to verify the theme would be testing
  implementation details.

- **Primary seam: Playwright E2E, landing page.** One E2E test file under
  `web/tests/landing.spec.ts` (or the project's chosen test directory) that:

  1. Loads `/` with `prefers-reduced-motion: no-preference` set.
  2. Asserts the hero headline text is exactly "Fast, global tips for
     livestream creators. Settled on Stellar."
  3. Asserts the subheadline text contains "Fans scan a QR and send a Stellar
     asset."
  4. Asserts a single primary CTA with text "Become a Creator" exists and has
     `href` pointing to `/onboarding`.
  5. Asserts three secondary cards render with headers "Already a Creator?",
     "Here to tip?", "How it works" and their respective CTA links point to
     `/dashboard`, the finder target, and the How it works section anchor.
  6. Asserts the "How it works" section renders three steps with labels "01 /
     Register", "02 / Share", "03 / Receive" and their body copy.
  7. Asserts the "Built on Stellar" section renders the three value props
     (Fast, Global, Low fee) and the roadmap note mentioning cross-border
     cash-out as a future capability.
  8. Asserts the page background computed style uses the Neutral color
     (rgb(14, 16, 19) equivalent of `#0E1013`) and the primary CTA background
     uses the Tertiary color (rgb(180, 255, 57) equivalent of `#B4FF39`), so
     the dark-only Graphite theme is verified at the computed-style level
     without asserting on token variable names.
  9. Repeats the load with `prefers-reduced-motion: reduce` and asserts the
     How it works steps are visible without scrolling (no `whileInView`
     animation gating), and that no Lenis instance is active (verified by
     asserting the page scrolls natively without a smooth-scroll wrapper
     intercepting the wheel event, or by asserting the absence of the Lenis
     data attribute on the body).

  This single seam covers content, structure, navigation, theme, and motion
  accessibility. The `playwright-cli` skill is available to drive this test.

- **Secondary seam: build and typecheck gate.** `pnpm build` and
  `pnpm typecheck` passing on a clean install is the gate that the scaffold is
  correct: Next.js compiles, TypeScript resolves, env validates at build time,
  route groups resolve, shadcn components install, fonts load. This is not a
  behavioral test but it is the scaffold's correctness verification and runs in
  CI before the E2E test.

- **Prior art.** No web tests exist in this repo yet (the web app is
  greenfield). The `contracts/donation-router` crate's PRD establishes the
  project's testing philosophy: "Tests exercise the contract's public API
  through its observable behavior... They do not assert on internal helper
  functions or storage key encoding." This PRD applies the same philosophy to
  the web layer: assert on rendered text, link targets, and computed styles,
  not on component internals.

- **Test scope boundary.** Visual regression / snapshot tests are out of scope
  for the MVP. `design.md` is the source of truth for visual decisions, and the
  E2E computed-style assertions on background and CTA color are sufficient to
  catch a token mapping regression. Unit tests for landing page components are
  out of scope: the components render static content with no logic to test, and
  the E2E seam covers their rendered output.

## Out of Scope

- The onboarding wizard (`/onboarding` flow: Supabase Auth, profile creation,
  wallet link, on-chain `register_creator`). That is a separate feature PRD.
- The donate page (`/donate/[handle]` UI, asset selector, trustline guidance,
  wallet connect, `donate()` transaction building). Separate feature PRD,
  consumes the `lib/stellar/client.ts` seam established here.
- The overlay (`/overlay/[handle]` Realtime subscription, alert rendering,
  OBS browser source optimization). Separate feature PRD, consumes the
  `lib/supabase/client.ts` anon-key seam established here.
- The dashboard (`/dashboard/*` pages: profile, wallet, payout, overlay
  settings, donations, moderation). Separate feature PRD, consumes the
  `(auth)/dashboard/layout.tsx` shell established here.
- The API route handlers (`/api/creators`, `/api/wallet/link`,
  `/api/donations/prepare`, `/api/donations/confirm`, `/api/indexer/poll`,
  `/api/creators/[handle]`). Stubbed here, implemented in their respective
  feature PRDs.
- The Supabase schema (tables `creators`, `donations`, `overlay_settings`,
  `indexer_state`, RLS policies). The `web/supabase/` directory is initialized
  here but no migrations are written.
- The wallet provider integration (Stellar Wallets Kit V2). The dependency is
  not installed in this PRD; it lands in the onboarding and donate feature PRDs.
- The `donate()` contract invocation from the client. The `lib/stellar/client.ts`
  seam is established here but the donate flow that uses it is a separate PRD.
- The indexer and confirm paths. Stubbed API routes exist here; implementation
  is a separate PRD consuming the `lib/stellar/server.ts` seam.
- Mainnet deployment. The MVP targets Testnet (per donation-router PRD).
- Light theme. The app ships dark-only per `design.md`.
- Internationalization. The landing page is English-only for the MVP.
- Analytics, A/B testing, and conversion tracking. Not part of the hackathon
  MVP.

## Further Notes

- This PRD is the implementation of the grilling session that locked the web
  project setup and landing page design. The grilling decisions are recorded in
  the conversation history; this PRD is the durable artifact.
- Domain vocabulary follows `CONTEXT.md`: Creator, Donor, Handle, Creator ID
  Hash, Donation, Donation ID Hash, Payout Address, Treasury, Admin, Platform
  Fee, DonationRouter, Token Allowlist, Overlay, Moderation Status. The PRD uses
  these terms as defined there.
- `design.md` was updated during the grilling session to clarify that the
  single-accent rule applies to resting state (hover/interaction shifts
  permitted) and that "one primary action per route/view" is the correct
  interpretation of "one action per screen". The updated `design.md` is the
  source of truth for visual decisions in this PRD.
- The `dapp` skill (`@stellar/stellar-sdk`, Stellar Wallets Kit V2, Next.js App
  Router patterns) and the `premium-frontend-ui` skill (Framer Motion, Lenis,
  performance guardrails, accessibility) are the reference shapes for the
  client-side portions of this PRD. The `shadcn` skill is the reference for the
  component registry setup. The `copywriting` skill informed the landing page
  copy draft.
- No new ADR is created for this PRD. All decisions are reversible (project
  location via `git mv`, framework via migration, styling via re-init) or are
  idiom (App Router route groups, `@supabase/ssr` split, `@t3-oss/env-nextjs`).
  None meet the "hard to reverse, surprising, real trade-off" bar for an ADR.
- The landing page is the first surface a hackathon judge sees. The demo script
  (spec §17) begins here. The page must communicate the product, the Stellar
  rail, and the entry point for the demo ("Become a Creator") within one
  viewport, with the How it works and Built on Stellar sections available on
  scroll for judges who want depth before running the demo.
