"use client";

import { motion, type Variants } from "framer-motion";
import { problemSection } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Problem section. Rendered as a terminal status report: three pain-point rows
 * expose the broken legacy tipping stack, setting up the Solution section.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const fade: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const row: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Problem() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="The problem"
      id="problem"
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="flex flex-col gap-4"
      >
        <motion.span
          variants={reduced ? undefined : fade}
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          <span className="text-primary" aria-hidden>&gt;</span>
          <span className="ml-2">The problem</span>
        </motion.span>
        <motion.h2
          variants={reduced ? undefined : fade}
          className="max-w-2xl font-display text-display-section text-balance text-foreground"
          aria-label={problemSection.headline}
        >
          {reduced ? (
            problemSection.headline
          ) : (
            <ScrambleText text={problemSection.headline} duration={1} />
          )}
        </motion.h2>
        <motion.p
          variants={reduced ? undefined : fade}
          className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {problemSection.body}
        </motion.p>
      </motion.div>

      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.3 }}
        className="mt-14 flex flex-col gap-3"
      >
        {problemSection.painPoints.map((point) => (
          <motion.div
            key={point.label}
            variants={reduced ? undefined : row}
            className="flex flex-col gap-1 border-l-2 border-primary/20 bg-card/30 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-8"
          >
            <span className="min-w-[10rem] font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {point.label}
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {point.value}
            </span>
            <span className="font-mono text-xs text-muted-foreground sm:ml-auto">
              {"// "}
              {point.note}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
