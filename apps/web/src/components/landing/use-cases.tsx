"use client";

import { motion, type Variants } from "framer-motion";
import { useCases } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Use-case grid. Four creator personas presented as terminal index cards,
 * each tagged with a mono role label and a short mission statement.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function UseCases() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Use cases"
      id="use-cases"
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary" aria-hidden>&gt;</span>
          <span className="ml-2">Who it is for</span>
        </span>
        <h2 className="font-display text-display-section text-balance text-foreground">
          Built for creators who go live.
        </h2>
      </div>

      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid gap-5 sm:grid-cols-2"
      >
        {useCases.map((useCase) => (
          <motion.div
            key={useCase.title}
            variants={reduced ? undefined : card}
            className="glass group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/10 p-7 transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-[0_0_24px_-12px_rgba(180,255,57,0.15)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-10 -right-6 font-display text-[7rem] font-semibold leading-none text-foreground/[0.03] transition-colors duration-500 group-hover:text-primary/[0.08]"
            >
              ✦
            </span>
            <h3
              className="relative z-10 font-display text-2xl font-semibold tracking-tight text-foreground"
              aria-label={useCase.title}
            >
              {reduced ? useCase.title : (
                <ScrambleText text={useCase.title} duration={0.8} />
              )}
            </h3>
            <p className="relative z-10 max-w-sm text-base leading-relaxed text-muted-foreground">
              {useCase.body}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
