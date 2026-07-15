"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
import { howItWorksSteps } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * "How it works" section, rendered as a vertical execution log. Steps are
 * connected by a timeline rail to reinforce the narrative progression.
 *
 * The animated list is dynamically imported with `ssr: false` so Framer Motion
 * does not enter the server bundle or the initial client bundle for the static
 * hero and cards sections. The static list is used both as the dynamic import's
 * loading fallback and as the render path when the user has set
 * `prefers-reduced-motion: reduce`, so the steps are always visible without
 * scrolling in the reduced-motion case.
 */
const HowItWorksAnimated = dynamic(
  () =>
    import("./how-it-works-animated").then((m) => m.HowItWorksAnimated),
  { ssr: false, loading: () => <HowItWorksStatic /> },
);

function HowItWorksStatic() {
  return (
    <ol className="mt-14 grid gap-5 sm:grid-cols-3">
      {howItWorksSteps.map((step) => (
        <li
          key={step.label}
          className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/10 bg-card/40 p-6 backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-[0_0_32px_-12px_rgba(180,255,57,0.12)]"
        >
          <span
            aria-hidden
            className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-6 -right-4 font-display text-[6rem] font-semibold leading-none text-foreground/[0.03] transition-colors duration-500 group-hover:text-primary/[0.08]"
          >
            ✦
          </span>
          <p className="relative z-10 flex items-center gap-3 font-mono text-sm tracking-wide text-primary/80">
            <span className="text-primary" aria-hidden>&gt;</span>
            {step.label}
          </p>
          <p className="relative z-10 text-base leading-relaxed text-foreground">
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
      aria-label="How it works"
      id="how-it-works"
      ref={ref}
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary" aria-hidden>&gt;</span>
          <span className="ml-2">The flow</span>
        </span>
        <motion.h2
          style={reduced ? undefined : { y: headingY }}
          className="font-display text-display-section text-balance text-foreground"
          aria-label="How it works"
        >
          {reduced ? (
            "How it works"
          ) : (
            <ScrambleText
              text="How it works"
              duration={1.0}
              disabled={reduced}
            />
          )}
        </motion.h2>
      </div>
      {reduced ? <HowItWorksStatic /> : <HowItWorksAnimated />}
    </section>
  );
}
