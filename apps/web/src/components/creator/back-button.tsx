"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Back control for the public Creator page. Always links to the Discover
 * surface (`/creator/explore`) so the destination is predictable regardless of
 * how the page was reached (shared link, direct entry, in-app navigation).
 *
 * Ghost glass surface per DESIGN.md so it reads on top of the cover banner
 * without competing with the single lime Donate CTA.
 */
export function BackButton({ className }: { className?: string }) {
  return (
    <Link
      href="/creator/explore"
      aria-label="Back to Discover"
      data-cursor="hover"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-foreground/10 bg-card/50 text-muted-foreground backdrop-blur-md transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
    </Link>
  );
}
