Status: ready-for-agent

## Parent

`.scratch/web-landing-page/PRD.md`

## What to build

Add the Playwright E2E test that verifies the landing page's external behavior:
content, structure, navigation, theme, and motion accessibility. This is the
single test seam for the landing page per the PRD testing decisions.

Install Playwright as a dev dependency and configure it for the `web/` project.
Add a `test:e2e` script to `web/package.json` that starts the Next.js dev server
(or build + start) and runs Playwright against it.

Write one E2E test file that:

1. Loads `/` with `prefers-reduced-motion: no-preference` set.
2. Asserts the hero headline text is exactly "Fast, global tips for livestream
   creators. Settled on Stellar."
3. Asserts the subheadline text contains "Fans scan a QR and send a Stellar
   asset."
4. Asserts a single primary CTA with text "Become a Creator" exists and has
   `href` pointing to `/onboarding`.
5. Asserts three secondary cards render with headers "Already a Creator?",
   "Here to tip?", "How it works" and their respective CTA links point to
   `/dashboard`, the finder target, and the `#how-it-works` anchor.
6. Asserts the "How it works" section renders three steps with labels "01 /
   Register", "02 / Share", "03 / Receive" and their body copy.
7. Asserts the "Built on Stellar" section renders the three value props (Fast,
   Global, Low fee) and the roadmap note mentioning cross-border cash-out as a
   future capability.
8. Asserts the page background computed style uses the Neutral color
   (`rgb(14, 16, 19)`, equivalent of `#0E1013`) and the primary CTA background
   uses the Tertiary color (`rgb(180, 255, 57)`, equivalent of `#B4FF39`), so
   the dark-only Graphite theme is verified at the computed-style level without
   asserting on token variable names.
9. Repeats the load with `prefers-reduced-motion: reduce` and asserts the "How
   it works" steps are visible without scrolling (no `whileInView` animation
   gating), and that no Lenis instance is active (assert the absence of the
   Lenis data attribute on the body, or that native scroll works without
   interception).

The test asserts on rendered text, link targets, and computed styles, not on
component internals, Tailwind class names, or Framer Motion variant objects
(per the PRD testing philosophy: test external behavior, not implementation
details).

`pnpm test:e2e` must pass.

## Acceptance criteria

- [ ] Playwright is installed and configured for the `web/` project.
- [ ] `test:e2e` script in `web/package.json` starts the app and runs Playwright.
- [ ] E2E test asserts the hero headline, subheadline, and primary CTA text and
      href.
- [ ] E2E test asserts the three secondary cards' headers, body copy, and CTA
      links.
- [ ] E2E test asserts the "How it works" section step labels and body copy.
- [ ] E2E test asserts the "Built on Stellar" value props and roadmap note.
- [ ] E2E test asserts the page background and CTA background computed styles
      match the Graphite Neutral and Tertiary colors.
- [ ] E2E test asserts `prefers-reduced-motion: reduce` renders steps statically
      and disables Lenis.
- [ ] `pnpm test:e2e` passes.

## Blocked by

- `.scratch/web-landing-page/issues/04-motion-accessibility.md`
