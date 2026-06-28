Status: ready-for-agent

## Parent

`.scratch/web-landing-page/PRD.md`

## What to build

The tracer bullet: a thin end-to-end slice that establishes the `web/` project,
wires the styling and tooling stack, applies the Graphite dark-only theme, and
renders the landing page hero at `/`.

Initialize a pnpm workspace at the repo root declaring `web/` as a package.
Scaffold a Next.js App Router project at `web/` with TypeScript, Tailwind v4,
`src/` directory, and the `@/*` path alias. Run `shadcn init` to set up the
component registry. Map the Graphite design tokens from `design.md` onto
shadcn's CSS variable layer (`--background` = `#0E1013`, `--card` = `#17191C`,
`--primary` = `#B4FF39`, `--foreground` = `#ECEDEE`, `--muted-foreground` =
`#9CA3AF`, radius values from `design.md`). Strip the light theme entirely; set
`class="dark"` permanently on the root `html` element. Load Inter Tight, Inter,
and JetBrains Mono via `next/font` and expose them as CSS variables consumed by
Tailwind.

Set up env validation via `@t3-oss/env-nextjs` with a `server` schema
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and a `client` schema
(`NEXT_PUBLIC_STELLAR_NETWORK` defaulting to `testnet`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`, optional
`NEXT_PUBLIC_LENIS_DISABLED`). Provide a `.env.example` documenting every
variable. A missing required variable must fail the build.

Implement the root layout (`src/app/layout.tsx`) with the dark class, fonts, and
a minimal Providers wrapper. Implement `src/app/(public)/page.tsx` as a Server
Component rendering only the hero section for now: the headline "Fast, global
tips for livestream creators. Settled on Stellar.", the subheadline "Fans scan a
QR and send a Stellar asset. The transaction settles in seconds, anywhere in the
world, for a fraction of a cent. Every donation is bound to an on-chain proof
the platform cannot forge.", and a single primary CTA "Become a Creator" linking
to `/onboarding`. The CTA uses the shadcn Button with the Tertiary (`--primary`)
background; it is the only Tertiary element on the page at rest, per the
single-accent rule in `design.md`. Generate the page `<title>` ("StarTip — Fast,
global tipping for livestream creators, settled on Stellar"), meta description,
and OpenGraph/Twitter card metadata via Next.js metadata.

`pnpm build` and `pnpm typecheck` must pass on a clean install. The hero must
render server-side (no `"use client"` on the page itself).

## Acceptance criteria

- [ ] `pnpm-workspace.yaml` exists at the repo root declaring `web/` as a
      workspace package.
- [ ] `web/` contains a Next.js App Router project with TypeScript, Tailwind v4,
      `src/` directory, and `@/*` → `./src/*` alias.
- [ ] `shadcn init` has run; `components.json` exists and the Button component
      is installed.
- [ ] Graphite tokens are mapped onto shadcn CSS variables in the global
      stylesheet; no light theme tokens remain.
- [ ] Root `html` element has `class="dark"` permanently; no light theme class
      or toggle exists.
- [ ] Inter Tight, Inter, and JetBrains Mono load via `next/font` and are wired
      into Tailwind font utilities.
- [ ] `@t3-oss/env-nextjs` validates env at build time; `.env.example` documents
      every variable; a missing required variable fails `pnpm build`.
- [ ] `src/app/(public)/page.tsx` renders the hero headline, subheadline, and a
      single primary CTA "Become a Creator" linking to `/onboarding`.
- [ ] The CTA is the only element using the Tertiary (`#B4FF39`) background at
      rest.
- [ ] Page metadata (`<title>`, meta description, OpenGraph, Twitter card) is
      generated via Next.js metadata API.
- [ ] `pnpm build` passes on a clean install.
- [ ] `pnpm typecheck` passes on a clean install.

## Blocked by

None - can start immediately.
