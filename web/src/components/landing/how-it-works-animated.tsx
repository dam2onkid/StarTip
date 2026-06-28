"use client";

import { motion, type Variants } from "framer-motion";
import { howItWorksSteps } from "@/content/landing";

/**
 * Animated "How it works" list. Dynamically imported by `HowItWorks` only when
 * the user has not set `prefers-reduced-motion: reduce`, so Framer Motion stays
 * out of the server bundle and the initial client bundle for the static hero
 * and cards sections.
 *
 * Only `transform` (`y`) and `opacity` are animated, per the
 * `premium-frontend-ui` skill §5 hardware acceleration guardrail. Steps reveal
 * with a 120ms stagger as the section enters the viewport.
 */
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const stepVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function HowItWorksAnimated() {
  return (
    <motion.ol
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      className="mt-12 grid gap-8 sm:grid-cols-3"
    >
      {howItWorksSteps.map((step) => (
        <motion.li
          key={step.label}
          variants={stepVariants}
          className="flex flex-col gap-3"
        >
          <p className="font-mono text-sm tracking-wide text-muted-foreground">
            {step.label}
          </p>
          <p className="text-base leading-relaxed text-foreground">
            {step.body}
          </p>
        </motion.li>
      ))}
    </motion.ol>
  );
}
