import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared dashboard navigation shell for the `(auth)` route group. Placeholder:
 * renders the StarTip wordmark and links to the dashboard sub-routes so the
 * nav shape is locked for subsequent feature PRDs. No real routing logic yet.
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
            <li>
              <Link href="/dashboard/profile" className="hover:text-foreground">
                Profile
              </Link>
            </li>
            <li>
              <Link href="/dashboard/wallet" className="hover:text-foreground">
                Wallet
              </Link>
            </li>
            <li>
              <Link href="/dashboard/payout" className="hover:text-foreground">
                Payout
              </Link>
            </li>
            <li>
              <Link href="/dashboard/overlay" className="hover:text-foreground">
                Overlay
              </Link>
            </li>
            <li>
              <Link href="/dashboard/donations" className="hover:text-foreground">
                Donations
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
