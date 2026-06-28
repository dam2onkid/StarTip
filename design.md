---
version: alpha
name: Graphite
description: Cool greys, one lime signal.
colors:
  primary: "#ECEDEE"
  secondary: "#9CA3AF"
  tertiary: "#B4FF39"
  neutral: "#0E1013"
  surface: "#17191C"
  on-primary: "#0E1013"
typography:
  display:
    fontFamily: Inter Tight
    fontSize: 4rem
    fontWeight: 600
    letterSpacing: "-0.03em"
  h1:
    fontFamily: Inter Tight
    fontSize: 2.25rem
    fontWeight: 600
  body:
    fontFamily: Inter
    fontSize: 0.95rem
    lineHeight: 1.55
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    letterSpacing: "0.02em"
rounded:
  sm: 6px
  md: 10px
  lg: 14px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
---
## Overview

An engineering-grade dark palette. Carefully tuned greys across 10 stops, with a single lime-green for focus and CTAs. The system is dark-only and depth-first: glassmorphism, photographic grain, parallax, and dimensional hover are permitted to build atmosphere, but the Graphite neutrals and the single lime accent remain the load-bearing identity.

## Colors

The palette is built around high-contrast neutrals and a single accent that drives interaction.

- **Primary (`#ECEDEE`):** Headlines and core text.
- **Secondary (`#9CA3AF`):** Borders, captions, and metadata.
- **Tertiary (`#B4FF39`):** The sole driver for interaction. Reserve it.
- **Neutral (`#0E1013`):** The page foundation.

## Typography

- **display:** Inter Tight, fluid `clamp(2.5rem, 8vw, 7rem)` for hero display, `clamp(2rem, 5vw, 4rem)` for section display.
- **h1:** Inter Tight 2.25rem
- **body:** Inter 0.95rem
- **label:** JetBrains Mono 0.75rem

## Do's and Don'ts

- **Do** use Tertiary for exactly one primary action per route/view at rest.
  Secondary and ghost variants carry the rest; Tertiary is reserved for the
  single most important CTA on the screen.
- **Do** let Neutral carry the composition — negative space is a feature.
- **Do** allow hover/interaction state shifts on the Tertiary element
  (background lightening/darkening, opacity, scale). The single-accent rule
  applies to resting state; interaction feedback is permitted.
- **Do** use glassmorphism (`backdrop-filter: blur()` over semi-transparent
  surfaces with ultra-thin borders) to build depth on navigation, cards, and
  the footer. Keep glass subtle; the neutrals stay readable.
- **Do** use a faint photographic grain overlay (SVG noise, opacity 0.02–0.05,
  `mix-blend-mode: overlay`) to remove digital sterility.
- **Do** use parallax, scroll-driven reveals, magnetic components, a custom
  lerp cursor, and dimensional hover (`transform: scale/rotateX/translate3d`)
  to build a premium tactile layer. Gate all of these behind
  `@media (hover: hover) and (pointer: fine)` and `prefers-reduced-motion:
  no-preference` so touch and reduced-motion users get a pristine static
  render.
- **Do** allow subtle atmospheric gradients (radial glows, vertical depth
  fades) built from the Graphite neutrals to support glass and parallax. Never
  introduce a second hue.
- **Don't** mix Tertiary with alternate accents; the single-accent rule is
  load-bearing. The lime is the only non-neutral color.
- **Don't** animate properties that trigger layout (`width`, `height`, `top`,
  `margin`). Animate `transform` and `opacity` only.
- **Don't** ship hover, cursor, or magnetic logic on touch devices, and don't
  ship continuous motion to reduced-motion users.
