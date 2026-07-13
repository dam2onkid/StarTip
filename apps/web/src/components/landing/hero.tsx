"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/landing/magnetic";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { NavAuth } from "@/lib/nav/auth";

/**
 * Hero architecture (premium-frontend-ui skill §2.2). Full-bleed `100dvh`
 * container, headline broken into word spans for a cascading entrance, and
 * parallax depth layers (a faint grid + a floating accent shape) that drift
 * on scroll. The CTA is magnetic and frosted.
 *
 * Only `transform` and `opacity` are animated. The word-stagger entrance is
 * disabled under `prefers-reduced-motion: reduce`, rendering the headline
 * statically. Parallax is likewise disabled for reduced-motion users.
 */

const HEADLINE = "Fast, global tips for livestream creators. Settled on Stellar.";
const SUBHEADLINE =
  "Fans scan a QR and send a Stellar asset. The transaction settles in seconds, anywhere in the world, for a fraction of a cent. Every donation is bound to an on-chain proof the platform cannot forge.";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: "0.5em", filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: "0em",
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const fade: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.5 },
  },
};

export function Hero({ auth }: { auth: NavAuth }) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Auth-aware CTA target: authed users go straight to discovery, unauthed
  // users land on the login surface.
  const ctaHref =
    auth.state === "authenticated" ? "/creator/explore" : "/login";

  // Parallax depth: background drifts up slower than foreground (skill §3.1).
  const gridY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const shapeY = useTransform(scrollYProgress, [0, 1], ["0%", "80%"]);
  const shapeX = useTransform(scrollYProgress, [0, 1], ["0%", "-15%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const words = React.useMemo(() => HEADLINE.split(" "), []);

  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh w-full items-center overflow-hidden"
    >
      {/* Parallax depth layers */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={reduced ? undefined : { y: gridY }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
          }}
        />
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          y: reduced ? undefined : shapeY,
          x: reduced ? undefined : shapeX,
          top: "18%",
          right: "-6%",
          width: "min(38vw, 520px)",
          aspectRatio: "1 / 1",
          borderRadius: "9999px",
          background:
            "radial-gradient(circle at 30% 30%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 65%)",
          filter: "blur(40px)",
          opacity: 0.5,
        }}
      />

      <motion.div
        style={reduced ? undefined : { y: contentY, opacity: contentOpacity }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-28 pb-20"
      >
        <motion.div
          initial={reduced ? false : "hidden"}
          animate="show"
          variants={reduced ? undefined : container}
          className="flex flex-col gap-3"
        >
          <motion.span
            variants={reduced ? undefined : fade}
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
          >
            <span className="text-primary">●</span> Tipping rail · Stellar
          </motion.span>
          <h1 className="font-display text-display-hero text-balance text-foreground">
            {reduced
              ? HEADLINE
              : words.map((w, i) => (
                  <React.Fragment key={`${w}-${i}`}>
                    <motion.span
                      variants={word}
                      className="inline-block [transform-origin:0_100%]"
                    >
                      {w}
                    </motion.span>
                    {i < words.length - 1 ? " " : ""}
                  </React.Fragment>
                ))}
          </h1>
        </motion.div>

        <motion.p
          initial={reduced ? false : "hidden"}
          animate="show"
          variants={reduced ? undefined : fade}
          className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {SUBHEADLINE}
        </motion.p>

        <motion.div
          initial={reduced ? false : "hidden"}
          animate="show"
          variants={reduced ? undefined : fade}
          className="flex flex-col gap-4 sm:flex-row sm:items-center"
        >
          <Magnetic strength={0.45}>
            <Button asChild size="lg" className="h-12 px-7 text-base">
              <Link href={ctaHref} data-cursor="hover">
                Get started
              </Link>
            </Button>
          </Magnetic>
          <Link
            href="#how-it-works"
            data-cursor="hover"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See how it works
            <span
              aria-hidden
              className="inline-block transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      {!reduced && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute inset-x-0 bottom-8 z-10 mx-auto flex w-fit flex-col items-center gap-2 text-muted-foreground"
        >
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em]">
            Scroll
          </span>
          <span className="relative h-10 w-px overflow-hidden bg-foreground/15">
            <motion.span
              className="absolute inset-x-0 top-0 h-4 bg-primary"
              animate={{ y: [-16, 40] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </span>
        </motion.div>
      )}
    </section>
  );
}
