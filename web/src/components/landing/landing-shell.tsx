"use client";

import * as React from "react";
import { Grain } from "@/components/landing/grain";
import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { SecondaryCards } from "@/components/landing/secondary-cards";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * Landing shell. Composes the grain + atmosphere overlays, the sticky nav, the
 * main sections, and the footer. The native cursor is used (no custom cursor
 * layer); the grain + atmosphere overlays and SiteNav are pure CSS / safe.
 */
export function LandingShell() {
  return (
    <>
      <Grain />
      <SiteNav />
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
