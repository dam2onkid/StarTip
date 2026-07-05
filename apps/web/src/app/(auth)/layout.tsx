import type { ReactNode } from "react";

/**
 * Shared shell for the `(auth)` route group, which contains `/dashboard`.
 *
 * The unified `SiteNav` is hoisted into the root `app/layout.tsx` so every
 * route inherits it without per-layout wiring. This layout is now a thin
 * passthrough that renders the route's children inside a `<main>` landmark,
 * filling the root layout's flex column. The previous static header (StarTip
 * wordmark + Dashboard link) is removed; navigation lives in the unified nav.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
