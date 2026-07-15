"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/landing/magnetic";
import { ScrambleText } from "@/components/landing/scramble-text";
import { finalCta, heroContent } from "@/content/landing";
import type { NavAuth } from "@/lib/nav/auth";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Final call-to-action band. Designed as a terminal command prompt: one
 * statement, one blinking cursor, and a single primary action. Respects the
 * single-accent rule by being the only primary CTA on screen at rest.
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

export function FinalCta({ auth }: { auth?: NavAuth }) {
  const reduced = usePrefersReducedMotion();
  const cta =
    auth?.state === "authenticated"
      ? heroContent.authenticatedCta
      : finalCta.cta;

  return (
    <section
      aria-label="Final call to action"
      className="relative z-10 w-full border-t border-foreground/10"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
        <motion.div
          variants={reduced ? undefined : container}
          initial={reduced ? false : "hidden"}
          whileInView={reduced ? undefined : "show"}
          viewport={{ once: true, amount: 0.3 }}
          className="glass relative flex flex-col items-start gap-8 overflow-hidden rounded-3xl border border-primary/10 bg-card/40 p-8 backdrop-blur-md sm:p-14"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -right-12 font-display text-[12rem] font-semibold leading-none text-foreground/[0.03]"
          >
            ✦
          </span>

          <div className="relative z-10 flex flex-col gap-4">
            <motion.span
              variants={reduced ? undefined : fade}
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              <span className="text-primary" aria-hidden>&gt;</span>
              <span className="ml-2">Start</span>
            </motion.span>
            <motion.h2
              variants={reduced ? undefined : fade}
              className="max-w-2xl font-display text-display-section text-balance text-foreground"
              aria-label={finalCta.headline}
            >
              {reduced ? finalCta.headline : (
                <ScrambleText text={finalCta.headline} duration={1} />
              )}
            </motion.h2>
            <motion.p
              variants={reduced ? undefined : fade}
              className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              {finalCta.body}
            </motion.p>
          </div>

          <motion.div variants={reduced ? undefined : fade} className="relative z-10">
            <Magnetic>
              <Button
                asChild
                size="lg"
                data-testid="final-cta-primary"
                className="h-12 px-8 text-base"
              >
                <Link href={cta.href}>{cta.label}</Link>
              </Button>
            </Magnetic>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
