"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { secondaryCards } from "@/content/landing";
import { TiltCard } from "@/components/landing/tilt-card";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Three secondary cards below the hero. Card CTAs use the secondary Button
 * variant so the hero "Sign in/up" CTA remains the single Tertiary
 * element on the page at rest (single-accent rule, DESIGN.md).
 *
 * Premium layer: each card is a frosted-glass surface with dimensional tilt on
 * fine-pointer devices and a staggered entrance as the grid enters the viewport.
 * Only `transform` and `opacity` are animated; the stagger and tilt are
 * disabled under `prefers-reduced-motion: reduce`.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function SecondaryCards() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Next steps"
      className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-28 sm:pb-36"
    >
      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="grid gap-5 sm:grid-cols-3"
      >
        {secondaryCards.map((item) => (
          <motion.div
            key={item.header}
            variants={reduced ? undefined : card}
            className="[perspective:1200px]"
          >
            <TiltCard className="glass h-full rounded-2xl p-6">
              <div className="flex h-full flex-col gap-6 [transform:translateZ(40px)] [transform-style:preserve-3d]">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full bg-primary/70"
                  />
                  <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
                    {item.header}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <div className="mt-auto">
                  <Button asChild variant={item.cta.variant} size="lg">
                    <Link href={item.cta.href} data-cursor="hover">
                      {item.cta.label}
                    </Link>
                  </Button>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
