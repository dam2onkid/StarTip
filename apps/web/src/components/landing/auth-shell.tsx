import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const NOISE_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

/**
 * Shared auth-page shell inspired by Databuddy's auth layout, adapted to the
 * Graphite design system.
 *
 * The shell splits the viewport into a focused two-panel card: a decorative
 * left panel (hidden on mobile) with a dark gradient, subtle lime glow, and a
 * StarTip tagline, and a right panel that carries the logo, the form, and a
 * small footer. The outer wrapper fills the small viewport so the surface
 * always sits edge-to-edge, even on mobile browsers with dynamic toolbars.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 md:p-6">
      <div className="flex min-h-[600px] w-full max-w-[1200px] overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]">
        {/* Left panel: brand atmosphere, hidden below md. */}
        <div className="relative hidden flex-col justify-between overflow-hidden rounded-l-2xl p-12 md:flex md:w-1/2">
          {/* Gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-card" />
          {/* Lime glow at the bottom-left */}
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_80%,rgba(180,255,57,0.12),transparent_60%)]" />
          {/* Top-right neutral depth */}
          <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_90%_10%,rgba(236,237,238,0.04),transparent_55%)]" />
          {/* Photographic grain */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
            style={{
              backgroundImage: `url("${NOISE_SVG}")`,
              backgroundSize: "240px 240px",
            }}
          />

          <Link
            href="/"
            className="group relative z-10 inline-flex items-center gap-2 text-sm text-foreground/50 transition-colors hover:text-foreground/80"
          >
            <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1" />
            Back
          </Link>

          <div className="relative z-10">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-primary">
              <span aria-hidden>&gt;</span> StarTip
            </p>
            <h1 className="mb-3 max-w-sm text-balance font-display text-4xl leading-[1.1] text-foreground/80">
              Global tips for livestream creators.
            </h1>
            <p className="max-w-sm text-pretty text-foreground/70">
              Fans scan a QR and send a Stellar asset. Transactions settle in
              seconds, anywhere in the world.
            </p>
          </div>
        </div>

        {/* Right panel: form surface. */}
        <div className="flex w-full flex-col overflow-auto md:w-1/2">
          <div className="flex justify-center p-6 pt-8 md:p-8 md:pt-20">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-medium"
              aria-label="StarTip home"
            >
              <Image
                src="/logo.png"
                alt="StarTip"
                width={120}
                height={32}
                priority
                className="h-7 w-auto sm:h-8"
              />
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-center p-4 md:p-8 md:pt-0">
            <div className="w-full max-w-md">{children}</div>
          </div>
          <div className="flex justify-center p-6 pb-8 text-center">
            <p className="text-sm text-muted-foreground">
              Built on{" "}
              <a
                href="https://stellar.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                Stellar
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
