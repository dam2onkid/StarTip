"use client";

import * as React from "react";
import Lenis from "lenis";

/**
 * Dynamically-loaded Lenis initializer. Imported by `LenisProvider` only when
 * the user has not set `prefers-reduced-motion: reduce` and the
 * `NEXT_PUBLIC_LENIS_DISABLED` env flag is not `"true"`, so the Lenis runtime
 * stays out of the server bundle and the initial client bundle for the static
 * hero and cards sections.
 *
 * Initializes Lenis on mount and destroys it on unmount. Renders no DOM of its
 * own; Lenis attaches to the document scroll root. The smooth-scroll layer
 * applies across the landing page (PRD user story 33, issue 04).
 */
export function LenisScroll() {
  React.useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}
