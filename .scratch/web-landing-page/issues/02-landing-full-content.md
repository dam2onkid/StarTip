Status: ready-for-agent

## Parent

`.scratch/web-landing-page/PRD.md`

## What to build

Complete the landing page content below the hero: the three secondary cards, the
"How it works" section (static, no animation yet), and the "Built on Stellar"
section.

Add a three-card grid below the hero. Each card uses the shadcn Card primitive
with the Surface (`--card`) background and Secondary (`--muted-foreground`)
borders. The cards are:

1. Header "Already a Creator?", body "View your donations, moderate messages,
   and configure your overlay.", CTA "Open Dashboard" linking to `/dashboard`.
2. Header "Here to tip?", body "Scan a QR from the stream, or look up a Creator
   by handle.", CTA "Find a Creator" (link target is a placeholder for now; the
   `/s/[handle]` route is stubbed in a separate issue).
3. Header "How it works", body "A donor scans, picks a Stellar asset, signs one
   transaction. The contract splits the fee, settles in seconds, and emits
   proof. The overlay shows the alert.", CTA "See the flow" linking to the
   `#how-it-works` anchor on the same page.

The card CTAs use a secondary or ghost Button variant (not the Tertiary primary
variant), so the "Become a Creator" CTA in the hero remains the single Tertiary
element on the page at rest, per the single-accent rule.

Add a "How it works" section with `id="how-it-works"`. Three numbered steps,
each with a label in JetBrains Mono and one sentence of body copy in Inter:

- "01 / Register" — "Create a profile, link your Stellar wallet, and register
  on-chain. The contract binds your handle to your payout address."
- "02 / Share" — "Get a donate link and QR. Drop the QR on your stream. Add the
  overlay URL to OBS."
- "03 / Receive" — "Fans donate. The contract settles in seconds, the overlay
  alerts, your dashboard tracks every tip with on-chain proof."

This section renders statically for now (no Framer Motion, no Lenis). The motion
layer lands in a separate issue.

Add a "Built on Stellar" section with three value props, each a heading plus one
sentence:

- "Fast." — "Transactions settle in seconds on a ledger built for payments. No
  waiting on block confirmations, no stuck transfers."
- "Global." — "Any wallet, any country. A donor in Tokyo and a creator in Hanoi
  settle on the same ledger in the same block."
- "Low fee." — "A fraction of a cent per transaction. The platform takes a
  bounded fee, on-chain and capped. The rest reaches the creator."

Below the three value props, a roadmap note: "Stellar's anchor network enables
cross-border cash-out to local currencies in 180+ countries. StarTip's MVP
settles on Testnet; fiat off-ramp integration is on the roadmap."

All copy uses the domain vocabulary from `CONTEXT.md` (Creator, Donor,
Donation, Handle, Payout Address, Platform Fee, Overlay). No exclamation points.
Active voice throughout. No gradients, no glassmorphism, no noise overlays.

## Acceptance criteria

- [ ] Three secondary cards render below the hero with the exact headers, body
      copy, and CTA labels specified above.
- [ ] Card 1 CTA links to `/dashboard`; card 3 CTA links to `#how-it-works`.
- [ ] Card CTAs use a secondary or ghost variant, not the Tertiary primary
      variant. The hero "Become a Creator" CTA remains the only Tertiary element
      at rest.
- [ ] "How it works" section has `id="how-it-works"` and renders three steps
      with the exact labels and body copy specified above.
- [ ] Step labels render in JetBrains Mono; step body copy renders in Inter.
- [ ] "Built on Stellar" section renders three value props (Fast, Global, Low
      fee) with the exact copy specified above.
- [ ] Roadmap note renders below the value props with the exact copy specified
      above, framing cross-border cash-out as a future capability, not an MVP
      feature.
- [ ] No gradients, glassmorphism, or noise overlays are present.
- [ ] `pnpm build` passes.
- [ ] `pnpm typecheck` passes.

## Blocked by

- `.scratch/web-landing-page/issues/01-scaffold-dark-theme-hero.md`
