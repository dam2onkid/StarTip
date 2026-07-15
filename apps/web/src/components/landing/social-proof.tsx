"use client";

import { motion, type Variants } from "framer-motion";
import { socialProofItems } from "@/content/landing";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Trust-signal band. Three concrete, verifiable claims rendered as a row of
 * terminal readouts with a thin top border that glows on entry.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export function SocialProof() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Trust signals"
      id="trust-signals"
      className="relative z-10 w-full border-t border-foreground/10"
    >
      <div className="relative mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <motion.div
          variants={reduced ? undefined : container}
          initial={reduced ? false : "hidden"}
          whileInView={reduced ? undefined : "show"}
          viewport={{ once: true, amount: 0.3 }}
          className="grid gap-4 sm:grid-cols-3"
        >
          {socialProofItems.map((proof) => (
            <motion.div
              key={proof.label}
              variants={reduced ? undefined : item}
              className="relative flex flex-col gap-2 rounded-2xl border border-primary/10 bg-card/40 p-6 backdrop-blur-sm"
            >
              <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <span className="font-display text-4xl font-semibold tracking-tight text-foreground">
                {proof.value}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                &gt; {proof.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
