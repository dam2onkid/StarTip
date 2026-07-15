"use client";

import * as React from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { roadmapNote, stellarValueProps } from "@/content/landing";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * "Built on Stellar" section, rendered as a system spec sheet. Three value
 * props sit in terminal-style cards that share a single-accent lime motif.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const prop: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function BuiltOnStellar() {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const headingY = useTransform(scrollYProgress, [0, 1], ["8%", "-8%"]);
  const gridY = useTransform(scrollYProgress, [0, 1], ["4%", "-4%"]);

  return (
    <section
      ref={ref}
      aria-label="Built on Stellar"
      id="built-on-stellar"
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary" aria-hidden>&gt;</span>
          <span className="ml-2">The rail</span>
        </span>
        <motion.h2
          style={reduced ? undefined : { y: headingY }}
          className="font-display text-display-section text-balance text-foreground"
          aria-label="Built on Stellar"
        >
          {reduced ? (
            "Built on Stellar"
          ) : (
            <ScrambleText
              text="Built on Stellar"
              duration={1.0}
              disabled={reduced}
            />
          )}
        </motion.h2>
      </div>

      <motion.div
        style={reduced ? undefined : { y: gridY }}
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid gap-5 sm:grid-cols-3"
      >
        {stellarValueProps.map((valueProp) => (
          <motion.div
            key={valueProp.heading}
            variants={reduced ? undefined : prop}
            className="glass group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/10 p-7 transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-[0_0_24px_-12px_rgba(180,255,57,0.15)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-10 -right-6 font-display text-[7rem] font-semibold leading-none text-foreground/[0.03] transition-colors duration-500 group-hover:text-primary/[0.08]"
            >
              ✦
            </span>
            <span className="relative z-10 font-mono text-xs uppercase tracking-[0.18em] text-primary/80">
              &gt; {valueProp.heading.replace(".", "").toLowerCase()}
            </span>
            <h3
              className="relative z-10 font-display text-3xl font-semibold tracking-tight text-foreground"
              aria-label={valueProp.heading}
            >
              {reduced ? valueProp.heading : (
                <ScrambleText text={valueProp.heading} duration={0.8} />
              )}
            </h3>
            <p className="relative z-10 max-w-xs text-base leading-relaxed text-muted-foreground">
              {valueProp.body}
            </p>
          </motion.div>
        ))}
      </motion.div>

      <motion.p
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.4 }}
        variants={reduced ? undefined : prop}
        className="mt-12 max-w-2xl border-l border-primary/20 pl-4 text-sm leading-relaxed text-muted-foreground"
      >
        {roadmapNote}
      </motion.p>
    </section>
  );
}
