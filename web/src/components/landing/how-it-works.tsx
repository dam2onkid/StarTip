"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
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
 * `how-it-works-animated.tsx`. The section heading drifts on scroll (parallax)
 * for non-reduced-motion users.
 */
const HowItWorksAnimated = dynamic(
  () =>
    import("./how-it-works-animated").then((m) => m.HowItWorksAnimated),
  { ssr: false, loading: () => <HowItWorksStatic /> },
);

function HowItWorksStatic() {
  return (
    <ol className="mt-14 grid gap-8 sm:grid-cols-3">
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
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const headingY = useTransform(scrollYProgress, [0, 1], ["6%", "-6%"]);

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          The flow
        </span>
        <motion.h2
          style={reduced ? undefined : { y: headingY }}
          className="font-display text-display-section text-balance text-foreground"
        >
          How it works
        </motion.h2>
      </div>
      {reduced ? <HowItWorksStatic /> : <HowItWorksAnimated />}
    </section>
  );
}
