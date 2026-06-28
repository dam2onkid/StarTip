"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { env } from "@/lib/env";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Smooth-scroll wrapper for the landing page. A client component because Lenis
 * touches the document scroll root on the client only.
 *
 * The Lenis initializer is dynamically imported with `ssr: false` so the Lenis
 * runtime does not enter the server bundle or the initial client bundle for the
 * static hero and cards sections. Lenis is initialized only when both:
 *
 * - the user has not set `prefers-reduced-motion: reduce` (accessibility
 *   guardrail, `premium-frontend-ui` skill §5 / PRD user story 34), and
 * - the `NEXT_PUBLIC_LENIS_DISABLED` env flag is not `"true"` (demo-run kill
 *   switch, PRD user story 35 / issue 04).
 *
 * Otherwise the page scrolls natively. Renders no DOM of its own; it just
 * mounts the initializer alongside its children.
 */
const LenisScroll = dynamic(
  () => import("./lenis-scroll").then((m) => m.LenisScroll),
  { ssr: false },
);

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  const lenisDisabled = env.NEXT_PUBLIC_LENIS_DISABLED === "true";
  const active = !reduced && !lenisDisabled;

  return (
    <>
      {active && <LenisScroll />}
      {children}
    </>
  );
}
