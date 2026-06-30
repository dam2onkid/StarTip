"use client";

import * as React from "react";
import { Grain } from "@/components/landing/grain";
import { Hero } from "@/components/landing/hero";
import { SecondaryCards } from "@/components/landing/secondary-cards";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * Landing shell. Composes the grain + atmosphere overlays, the main sections,
 * and the footer. The unified `SiteNav` is rendered once at the root
 * `app/layout.tsx` so it appears on every route; it is no longer composed here
 * (hoisting it out avoids a duplicate nav on the landing page). The native
 * cursor is used (no custom cursor layer); the grain + atmosphere overlays are
 * pure CSS / safe.
 */
export function LandingShell() {
  return (
    <>
      <Grain />
      <main className="relative flex flex-1 flex-col">
        <Hero />
        <SecondaryCards />
        <HowItWorks />
        <BuiltOnStellar />
      </main>
      <SiteFooter />
    </>
  );
}
