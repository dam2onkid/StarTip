"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { solutionSection } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Solution section. Presents StarTip as the fix to the problem, then offers
 * two clear paths: creator or fan. Uses the terminal/cyber motif (mono labels,
 * thin borders, staggered reveal) so it reads like a system status report.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const fade: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const card: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Solution() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="The fix"
      id="solution"
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
          <span className="ml-2">The fix</span>
        </motion.span>
        <motion.h2
          variants={reduced ? undefined : fade}
          className="max-w-2xl font-display text-display-section text-balance text-foreground"
          aria-label={solutionSection.headline}
        >
          {reduced ? (
            solutionSection.headline
          ) : (
            <ScrambleText text={solutionSection.headline} duration={1} />
          )}
        </motion.h2>
        <motion.p
          variants={reduced ? undefined : fade}
          className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {solutionSection.body}
        </motion.p>
      </motion.div>

      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid gap-5 sm:grid-cols-2"
      >
        {solutionSection.paths.map((path) => (
          <motion.div
            key={path.role}
            variants={reduced ? undefined : card}
            className="glass group relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-primary/10 p-8 transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-[0_0_32px_-12px_rgba(180,255,57,0.12)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-8 -right-5 font-display text-[6rem] font-semibold leading-none text-foreground/[0.03] transition-colors duration-500 group-hover:text-primary/[0.08]"
            >
              ✦
            </span>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary/80">
                &gt; {path.role}
              </span>
              <p className="text-base leading-relaxed text-muted-foreground">
                {path.body}
              </p>
            </div>
            <div className="relative z-10 mt-auto">
              <Button asChild variant="secondary" size="lg">
                <Link href={path.href} data-cursor="hover">
                  {path.cta}
                </Link>
              </Button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
