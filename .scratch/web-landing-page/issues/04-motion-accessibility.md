Status: ready-for-agent

## Parent

`.scratch/web-landing-page/PRD.md`

## What to build

Add the motion layer to the landing page: Framer Motion staggered reveals on
the "How it works" steps, Lenis smooth scrolling across the page, and the full
accessibility and performance guardrails.

Install `framer-motion` and `lenis` as dependencies. Both must be dynamically
imported on the client only so they do not enter the server bundle or the
initial client bundle for the static hero and cards sections.

Convert the "How it works" section to a client component (`"use client"`). Use
Framer Motion's `whileInView` to reveal each step with a staggered
fade-and-translate-up: `opacity: 0 → 1`, `y: 16 → 0`, staggered by 120ms. Only
`transform` and `opacity` are animated; never `width`, `height`, `top`, or
`margin` (per the `premium-frontend-ui` skill hardware acceleration guardrail).

Add a Lenis smooth-scroll wrapper as a client component that initializes Lenis
on mount and destroys it on unmount. The wrapper wraps the page body so smooth
scrolling applies across the landing page.

Gate the entire motion layer behind
`@media (prefers-reduced-motion: no-preference)`. When the user has set
`prefers-reduced-motion: reduce` in their OS:

- The "How it works" steps render statically (no `whileInView`, visible
  immediately without scrolling).
- Lenis is not initialized; the page scrolls natively.

Add a `NEXT_PUBLIC_LENIS_DISABLED` env flag (already declared in the env schema
from issue 01). When set to `"true"`, Lenis is not initialized even if
`prefers-reduced-motion` is `no-preference`. This allows disabling Lenis for
fast demo runs where scroll hijack feels sticky, without removing code.

Gate any hover-only interactions behind
`@media (hover: hover) and (pointer: fine)` so the page does not ship hover
logic that breaks on touch devices (per the `premium-frontend-ui` skill
responsive degradation guardrail).

The hero, secondary cards, and "Built on Stellar" sections remain Server
Components. Only the "How it works" section and the Lenis wrapper are client
components.

`pnpm build` and `pnpm typecheck` must pass.

## Acceptance criteria

- [ ] `framer-motion` and `lenis` are installed and dynamically imported on the
      client only.
- [ ] "How it works" steps reveal with a staggered fade-and-translate-up
      (`opacity: 0 → 1`, `y: 16 → 0`, 120ms stagger) via Framer Motion
      `whileInView`.
- [ ] Only `transform` and `opacity` are animated; no `width`, `height`, `top`,
      or `margin` animations.
- [ ] Lenis smooth scrolling is active across the landing page by default.
- [ ] With `prefers-reduced-motion: reduce`, the "How it works" steps render
      statically (visible without scrolling) and Lenis is not initialized.
- [ ] With `NEXT_PUBLIC_LENIS_DISABLED=true`, Lenis is not initialized even
      when `prefers-reduced-motion` is `no-preference`.
- [ ] Hover-only interactions are gated behind
      `@media (hover: hover) and (pointer: fine)`.
- [ ] Hero, secondary cards, and "Built on Stellar" sections remain Server
      Components; only "How it works" and the Lenis wrapper are client
      components.
- [ ] `pnpm build` passes.
- [ ] `pnpm typecheck` passes.

## Blocked by

- `.scratch/web-landing-page/issues/02-landing-full-content.md`
