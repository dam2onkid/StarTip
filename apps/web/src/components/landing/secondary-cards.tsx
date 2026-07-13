"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { secondaryCards } from "@/content/landing";
import { BorderGlow } from "@/components/landing/border-glow";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Three secondary cards below the hero. Card CTAs use the secondary Button
 * variant so the hero "Sign in/up" CTA remains the single Tertiary
 * element on the page at rest (single-accent rule, DESIGN.md).
 *
 * Premium layer: each card is a dark surface with a directional edge glow that
 * follows the pointer on fine-pointer devices, plus a staggered entrance as the
 * grid enters the viewport. Only `transform` and `opacity` are animated; the
 * glow and stagger are disabled under `prefers-reduced-motion: reduce`.
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
      className="relative z-10 w-full border-t border-foreground/10"
    >
      {/* Subtle atmospheric fade from the hero terminal pattern into the
          solid page background, giving the section a deliberate entry. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-24 bg-gradient-to-b from-transparent to-background/80"
      />
      {/* Faint radial glow behind the cards - low enough opacity to stay within
          the Graphite single-accent rule. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(180,255,57,0.04),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
        <motion.div
          variants={reduced ? undefined : container}
          initial={reduced ? false : "hidden"}
          whileInView={reduced ? undefined : "show"}
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-5 sm:grid-cols-3"
        >
          {secondaryCards.map((item) => (
            <motion.div key={item.header} variants={reduced ? undefined : card}>
              <BorderGlow
                className="h-full"
                backgroundColor="#17191C"
                borderRadius={14}
                glowColor="78 100 64"
                glowRadius={20}
                colors={["#B4FF39", "#ECEDEE", "#9CA3AF"]}
                data-cursor="hover"
              >
                <div className="flex h-full flex-col gap-6 p-6">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="font-mono text-xs text-primary/70"
                    >
                      &gt;
                    </span>
                    <h3
                      className="font-mono text-xs uppercase tracking-[0.18em] text-foreground"
                      aria-label={item.header}
                    >
                      {reduced ? (
                        item.header
                      ) : (
                        <ScrambleText
                          text={item.header}
                          duration={0.8}
                          disabled={reduced}
                        />
                      )}
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
              </BorderGlow>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
