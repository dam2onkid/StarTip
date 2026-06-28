"use client";

import dynamic from "next/dynamic";
import { howItWorksSteps } from "@/content/landing";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * "How it works" section. A client component because it gates Framer Motion
 * reveals on the user's `prefers-reduced-motion` preference.
 *
 * The animated list is dynamically imported with `ssr: false` so Framer Motion
 * does not enter the server bundle or the initial client bundle for the static
 * hero and cards sections. The static list is used both as the dynamic import's
 * loading fallback and as the render path when the user has set
 * `prefers-reduced-motion: reduce`, so the steps are always visible without
 * scrolling in the reduced-motion case (PRD user story 34, issue 04).
 *
 * Step labels render in JetBrains Mono (`font-mono`), step body copy in Inter
 * (body default). Only `transform` and `opacity` are animated; see
 * `how-it-works-animated.tsx`.
 */
const HowItWorksAnimated = dynamic(
  () =>
    import("./how-it-works-animated").then((m) => m.HowItWorksAnimated),
  { ssr: false, loading: () => <HowItWorksStatic /> },
);

function HowItWorksStatic() {
  return (
    <ol className="mt-12 grid gap-8 sm:grid-cols-3">
      {howItWorksSteps.map((step) => (
        <li key={step.label} className="flex flex-col gap-3">
          <p className="font-mono text-sm tracking-wide text-muted-foreground">
            {step.label}
          </p>
          <p className="text-base leading-relaxed text-foreground">
            {step.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-5xl scroll-mt-24 border-t border-muted-foreground/20 px-6 py-24 sm:py-32"
    >
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        How it works
      </h2>
      {reduced ? <HowItWorksStatic /> : <HowItWorksAnimated />}
    </section>
  );
}
