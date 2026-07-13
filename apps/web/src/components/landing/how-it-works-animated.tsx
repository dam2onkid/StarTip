"use client";

import { motion, type Variants } from "framer-motion";
import { howItWorksSteps } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";

/**
 * Animated "How it works" list. Dynamically imported by `HowItWorks` only when
 * the user has not set `prefers-reduced-motion: reduce`, so Framer Motion stays
 * out of the server bundle and the initial client bundle for the static hero
 * and cards sections.
 *
 * Only `transform` (`y`) and `opacity` are animated, per the
 * `premium-frontend-ui` skill §5 hardware acceleration guardrail. Steps reveal
 * with a 120ms stagger as the section enters the viewport. Each step shows a
 * large faded ordinal behind the label for editorial weight.
 */
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const stepVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function HowItWorksAnimated() {
  return (
    <motion.ol
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      className="mt-14 grid gap-4 sm:grid-cols-3"
    >
      {howItWorksSteps.map((step, i) => (
        <motion.li
          key={step.label}
          variants={stepVariants}
          className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/10 bg-card/40 p-8 backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-300 hover:border-primary/30 hover:bg-card/70 hover:shadow-[0_0_24px_-12px_rgba(180,255,57,0.15)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-3 font-display text-7xl font-semibold leading-none text-foreground/[0.05] transition-colors duration-300 group-hover:text-primary/10"
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <p className="relative z-10 font-mono text-sm tracking-wide text-primary/80">
            <ScrambleText text={step.label} duration={0.8} />
          </p>
          <p className="relative z-10 max-w-xs text-base leading-relaxed text-foreground">
            {step.body}
          </p>
          <span
            aria-hidden
            className="relative z-10 mt-2 h-px w-10 origin-left bg-primary/50 transition-transform duration-500 group-hover:scale-x-[2.5]"
          />
        </motion.li>
      ))}
    </motion.ol>
  );
}
