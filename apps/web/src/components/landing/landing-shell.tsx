"use client";

import * as React from "react";
import { Grain } from "@/components/landing/grain";
import { Scanlines } from "@/components/landing/scanlines";
import { Hero } from "@/components/landing/hero";
import { SecondaryCards } from "@/components/landing/secondary-cards";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { SiteFooter } from "@/components/landing/site-footer";
import type { NavAuth } from "@/lib/nav/auth";

/**
 * Landing shell. Composes the grain + atmosphere + scanline overlays, the main
 * sections, and the footer. The unified `SiteNav` is rendered once at the root
 * `app/layout.tsx` so it appears on every route; it is no longer composed here
 * (hoisting it out avoids a duplicate nav on the landing page). The native
 * cursor is used (no custom cursor layer); the overlays are pure CSS / safe.
 *
 * `auth` is resolved server-side in the landing page and threaded down so the
 * Hero CTA can route authed users to `/creator/explore` and unauthed users to
 * `/login`.
 */
export function LandingShell({ auth }: { auth: NavAuth }) {
  return (
    <>
      <Grain />
      <Scanlines />
      <main className="relative flex flex-1 flex-col">
        <Hero auth={auth} />
        <SecondaryCards />
        <HowItWorks />
        <BuiltOnStellar />
      </main>
      <SiteFooter />
    </>
  );
}
