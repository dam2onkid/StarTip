import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for the `(auth)` route group, which now contains only
 * `/dashboard`. Renders the StarTip wordmark and a Dashboard nav link. The
 * dashboard sub-routes were collapsed into a single tabbed page; the nav shape
 * is locked here for subsequent feature PRDs.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border/40">
        <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            StarTip
          </Link>
          <ul className="flex items-center gap-4 text-sm text-muted-foreground">
            <li>
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
