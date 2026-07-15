"use client";

import { motion, type Variants } from "framer-motion";
import { howItWorksSteps } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";

/**
 * Animated "How it works" grid. Steps reveal as balanced cards that fade and
 * rise in sequence, replacing the previous left-heavy vertical rail.
 */
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function HowItWorksAnimated() {
  return (
    <motion.ol
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      className="mt-14 grid gap-5 sm:grid-cols-3"
    >
      {howItWorksSteps.map((step) => (
        <motion.li
          key={step.label}
          variants={cardVariants}
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
            <ScrambleText text={step.label} duration={0.7} />
          </p>
          <p className="relative z-10 text-base leading-relaxed text-foreground">
            {step.body}
          </p>
        </motion.li>
      ))}
    </motion.ol>
  );
}
