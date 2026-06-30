Status: ready-for-agent

## Parent

`.scratch/web-unified-nav/PRD.md`

## What to build

Hoist the StarTip navigation from the landing-only `LandingShell` into the root
`app/layout.tsx` so a single nav renders on every page. Remove the separate
header currently rendered by `(auth)/layout.tsx`. Isolate the OBS Overlay
(`/overlay/*`) from the unified nav so the browser-source surface stays
transparent and chrome-free (the Overlay route group uses a layout that skips the
nav, or the nav suppresses itself based on the current pathname).

Finalize the left cluster to its end shape: the StarTip logo (links to `/`) and a
single "Discover" link to `/creator/explore`. Drop the old "How it works" and
"Built on Stellar" scroll-spy anchor links from the nav (those sections remain
on the landing page; they are no longer nav destinations). Keep the existing
"Become a Creator" CTA in the right cluster for now; it is reworked in slice 3.
The mobile menu reflects the same left links.

The existing `SiteNav` component is the starting point. Preserve its visual
language (floating glass pill, scroll-aware frost, magnetic CTA, animated
underline, `prefers-reduced-motion` fallback) per `DESIGN.md`. Refactor it into a
component that can render from the root layout without depending on
`LandingShell`.

Update existing E2E tests (`tests/landing.spec.ts`, `tests/public-discovery.spec.ts`,
`tests/login.spec.ts`, `tests/signup`-related, `tests/donate.spec.ts`,
`tests/donor-tab.spec.ts`, `tests/creator-tab.spec.ts`) so they assert the new
nav presence and the "Discover" link target on every public and auth page, and so
they assert the Overlay page renders without a nav.

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] The root `app/layout.tsx` renders the unified nav on every route except
      `/overlay/*`.
- [ ] The `(auth)/layout.tsx` header is removed; the `(auth)` route group
      inherits the unified nav from the root layout.
- [ ] `/overlay/[handle]` renders no nav (no logo, no links, no CTA, no mobile
      menu toggle).
- [ ] The left cluster shows the StarTip logo (links to `/`) and a "Discover"
      link to `/creator/explore`, in both auth states, on desktop and mobile.
- [ ] The old "How it works" and "Built on Stellar" scroll-spy anchor links are
      removed from the nav.
- [ ] The existing "Become a Creator" CTA remains in the right cluster, on every
      non-overlay page.
- [ ] The nav preserves the Graphite visual language (floating glass pill,
      scroll-aware frost, magnetic CTA, animated underline, reduced-motion
      fallback).
- [ ] E2E tests assert the nav and "Discover" link are present on every public
      and auth page, and assert the Overlay page renders no nav.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

None - can start immediately
