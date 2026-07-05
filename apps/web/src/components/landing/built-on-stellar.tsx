"use client";

import * as React from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { roadmapNote, stellarValueProps } from "@/content/landing";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * "Built on Stellar" section. Three MVP-true value props plus a roadmap note
 * that frames cross-border cash-out as a Stellar ecosystem roadmap capability,
 * not an MVP feature.
 *
 * Premium layer: the heading and the value-prop grid drift on scroll at
 * different speeds (parallax), and each prop reveals with a staggered
 * fade-and-translate as the grid enters the viewport. Only `transform` and
 * `opacity` are animated. Reduced-motion users get a static render.
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
          The rail
        </span>
        <motion.h2
          style={reduced ? undefined : { y: headingY }}
          className="font-display text-display-section text-balance text-foreground"
        >
          Built on Stellar
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
            className="glass group relative flex flex-col gap-4 overflow-hidden rounded-2xl p-7"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-10 -right-6 font-display text-[7rem] font-semibold leading-none text-foreground/[0.03] transition-colors duration-500 group-hover:text-primary/[0.08]"
            >
              ✦
            </span>
            <h3 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              {valueProp.heading}
            </h3>
            <p className="max-w-xs text-base leading-relaxed text-muted-foreground">
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
        className="mt-12 max-w-2xl text-sm leading-relaxed text-muted-foreground"
      >
        {roadmapNote}
      </motion.p>
    </section>
  );
}
