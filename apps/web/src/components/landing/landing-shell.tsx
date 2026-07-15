"use client";

import * as React from "react";
import { Grain } from "@/components/landing/grain";
import { Scanlines } from "@/components/landing/scanlines";
import { Hero } from "@/components/landing/hero";
import { SocialProof } from "@/components/landing/social-proof";
import { Solution } from "@/components/landing/solution";
import { Problem } from "@/components/landing/problem";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { UseCases } from "@/components/landing/use-cases";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
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
 * Hero and Final CTA can route authed users to `/dashboard` and unauthed users
 * to `/login`.
 */
export function LandingShell({ auth }: { auth: NavAuth }) {
  return (
    <>
      <Grain />
      <Scanlines />
      <main className="relative flex flex-1 flex-col">
        <Hero auth={auth} />
        <Problem />
        <Solution />
        <HowItWorks />
        <BuiltOnStellar />
        <UseCases />
        <SocialProof />
        <Faq />
        <FinalCta auth={auth} />
      </main>
      <SiteFooter />
    </>
  );
}
