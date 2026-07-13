"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/landing/magnetic";
import { ScrambleText } from "@/components/landing/scramble-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { NavAuth } from "@/lib/nav/auth";
import FaultyTerminal from "@/components/landing/faulty-terminal";

/**
 * Hero architecture (premium-frontend-ui skill §2.2). Full-bleed `100dvh`
 * container, headline broken into word spans for a cascading entrance, and
 * a dim, glitchy WebGL terminal backdrop. The CTA is magnetic and frosted.
 *
 * Only `transform` and `opacity` are animated. The word-stagger entrance is
 * disabled under `prefers-reduced-motion: reduce`, rendering the headline
 * statically. Parallax is likewise disabled for reduced-motion users.
 */

const HEADLINE = `Global tips for livestream creators.`;
const SUBHEADLINE =
  "Fans scan a QR and send a Stellar asset. The transaction settles in seconds, anywhere in the world, for a fraction of a cent. Every donation is bound to an on-chain proof the platform cannot forge. Build on Stellar.";

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
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
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

  // Parallax depth: content drifts up/fades on scroll while the terminal
  // stays pinned as a full-bleed backdrop.
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh w-full items-center overflow-hidden"
    >
      {/* Glitchy terminal backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <FaultyTerminal
          className="pointer-events-none"
          scale={2}
          gridMul={[2, 1]}
          digitSize={1.2}
          timeScale={0.5}
          pause={reduced}
          scanlineIntensity={1}
          glitchAmount={1}
          flickerAmount={1}
          noiseAmp={1}
          chromaticAberration={0}
          dither={0}
          curvature={0}
          tint="#B4FF39"
          mouseReact={false}
          mouseStrength={0.5}
          pageLoadAnimation={false}
          brightness={0.1}
        />
      </div>

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
            <span className="text-primary" aria-hidden>&gt;</span>
            <span className="ml-2">Tipping rail · Stellar</span>
          </motion.span>
          <motion.h1
            variants={reduced ? undefined : word}
            className="font-mono font-semibold text-display-hero text-balance text-foreground"
            aria-label={HEADLINE}
          >
            <span className="text-primary" aria-hidden>&gt;</span>
            <span className="ml-2">
              {reduced ? (
                HEADLINE
              ) : (
                <ScrambleText
                  text={HEADLINE}
                  duration={1.2}
                  delay={0.6}
                  disabled={reduced}
                />
              )}
            </span>
            {!reduced && (
              <motion.span
                className="ml-1 font-mono text-primary"
                aria-hidden
                animate={{ opacity: [1, 0, 0, 1] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: "linear",
                  times: [0, 0.49, 0.51, 1],
                }}
              >
                |
              </motion.span>
            )}
            {reduced && (
              <span className="ml-1 font-mono text-primary" aria-hidden>|</span>
            )}
          </motion.h1>
        </motion.div>

        <motion.p
          initial={reduced ? false : "hidden"}
          animate="show"
          variants={reduced ? undefined : fade}
          className="max-w-2xl border-l border-primary/20 pl-4 text-base leading-relaxed text-muted-foreground sm:text-lg"
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
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-base shadow-[0_0_24px_-6px_rgba(180,255,57,0.35)]"
            >
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
