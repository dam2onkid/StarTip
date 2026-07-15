"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import { Menu, X, Bell } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/landing/magnetic";
import { NavAvatarMenu } from "@/components/landing/nav-avatar-menu";
import { useLogout } from "@/hooks/use-logout";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { NavAuth } from "@/lib/nav/auth";
import { cn } from "@/lib/utils";

/**
 * Unified site navigation (PRD: Unified hybrid navigation).
 *
 * Rendered from the root `app/layout.tsx` so a single nav appears on every
 * route. The OBS Overlay browser-source surface (`/overlay/*`) and the focused
 * auth surfaces (`/login`, `/signup`) are excluded: the nav suppresses itself
 * based on the current pathname so those surfaces stay clean and distraction
 * free. All hooks run before the suppression guard so the hook order is stable
 * across pathname changes.
 *
 * Visual language is preserved per `DESIGN.md`: a floating glass pill detached
 * from the viewport edges, scroll-aware frost, a magnetic CTA with a lime glow
 * on hover, and an animated underline on the desktop links. The left cluster
 * is its final shape: the StarTip logo (links to `/`) and three left-aligned
 * tabs, "Home" (`/`), "Discover" (`/creator/explore`), and "Docs" (`/docs`).
 * The logo and tabs sit together in a flex-start left cluster so the tabs
 * follow the logo instead of being centered by the outer `justify-between`.
 * The right cluster is auth-aware (issue 03): the
 * root layout resolves the Supabase session server-side and passes a
 * `NavAuth` prop. Unauthenticated: the "Sign in/up" CTA links to
 * `/login`. Authenticated: the CTA is replaced by a static notification bell
 * (icon-only button with an empty-state dropdown) and an avatar menu
 * (`NavAvatarMenu`) showing display_name + email, a Dashboard link, and a
 * Logout item that reuses the shared `useLogout` handler. The active link is
 * driven by the current pathname (the left links are real routes, not
 * same-page scroll-spy anchors).
 *
 * Breakpoint strategy: a single `md` split. Below `md` the pill shows logo +
 * hamburger only; the links and right-cluster actions live in an animated
 * dropdown that mirrors the left cluster and the desktop right cluster. At
 * `md` and above the pill shows logo + links + right cluster, and the
 * hamburger is hidden.
 *
 * Only `transform` and `opacity` are animated. On touch devices and when
 * `prefers-reduced-motion: reduce` is set, the header stays fixed and visible
 * and the mobile menu uses plain show/hide.
 */
const LINKS = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/creator/explore" },
  { label: "Docs", href: "/docs" },
] as const;

/**
 * Static notification bell (PRD: Unified hybrid navigation, issue 03). An
 * icon-only button that opens an empty-state dropdown. Real notification events
 * are out of scope; the bell only reserves its place in the authed right
 * cluster so users know where notifications will appear.
 */
function NavNotificationsBell() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="inline-flex size-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Bell className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[12rem] rounded-xl border border-foreground/10 bg-background/95 px-4 py-3 text-sm text-muted-foreground shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
        >
          No notifications yet
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function SiteNav({ auth = { state: "unauthenticated" } }: { auth?: NavAuth } = {}) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  // Shared signOut + redirect handler. Called from the mobile menu's Logout
  // button; the desktop avatar menu has its own `useLogout` call site. The
  // hook is invoked unconditionally (before the overlay early return) so the
  // hook order stays stable across pathname changes.
  const logout = useLogout();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  // Suppress the nav on the OBS Overlay browser-source surface and on the
  // focused auth surfaces so they stay clean and chrome-free. The guard runs
  // after every hook so the hook call order is identical across routes.
  const isOverlay = pathname?.startsWith("/overlay/") ?? false;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isLanding = pathname === "/";
  const authed = auth.state === "authenticated";

  // Lock body scroll when the mobile menu is open.
  React.useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [menuOpen]);

  if (isOverlay || isAuthPage) return null;

  return (
    <header
      className={cn(
        "z-50 px-4 pt-4 sm:px-6 sm:pt-5",
        isLanding
          ? "pointer-events-none absolute inset-x-0 top-0"
          : "relative",
      )}
    >
      <nav
        aria-label="Primary"
        className={cn(
          "pointer-events-auto relative mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.08] px-4 py-2.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 sm:px-5",
          menuOpen && "bg-foreground/[0.1]",
        )}
      >
        {/* Left cluster: logo + desktop links, flex-start so the tabs follow
            the logo instead of being centered by the outer justify-between. */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link
            href="/"
            className="group relative inline-flex h-8 shrink-0 items-center"
            aria-label="StarTip home"
          >
            <Image
              src="/logo.png"
              alt="StarTip"
              width={120}
              height={32}
              priority
              className="h-7 w-auto transition-transform duration-300 group-hover:scale-[1.04] sm:h-8"
            />
          </Link>

          {/* Desktop links with animated underline + active highlight */}
          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Magnetic strength={0.2} className="inline-block">
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group/link relative rounded-md px-3.5 py-2 text-sm transition-colors duration-200",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {link.label}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-3.5 -bottom-0.5 h-px origin-left bg-primary/60 transition-transform duration-300 ease-out",
                          active
                            ? "scale-x-100"
                            : "scale-x-0 group-hover/link:scale-x-100",
                        )}
                      />
                    </Link>
                  </Magnetic>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right cluster: auth-aware CTA / bell + avatar menu (desktop) +
            mobile toggle */}
        <div className="flex items-center gap-2">
          {authed ? (
            <>
              {/* TODO: Notification bell temporarily hidden while notifications
                  are not wired up. Restore this once real-time notifications
                  are implemented. */}
              {/* <div className="hidden md:block">
                <NavNotificationsBell />
              </div> */}
              {/* Avatar menu, desktop right cluster. Replaces the CTA when
                  authed; shows display_name + email header, Dashboard link,
                  and a Logout item that reuses the shared useLogout handler. */}
              <div className="hidden md:block">
                <NavAvatarMenu
                  displayName={auth.displayName}
                  email={auth.email}
                  avatarUrl={auth.avatarUrl}
                />
              </div>
            </>
          ) : (
            <Magnetic strength={0.4} className="hidden md:inline-block">
              <Button asChild size="lg">
                <Link href="/login">Sign in/up</Link>
              </Button>
            </Magnetic>
          )}

          {/* Mobile menu toggle — shows below md only */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground transition-colors hover:bg-foreground/[0.06] md:hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              {menuOpen ? (
                <motion.span
                  key="x"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="size-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu"
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="size-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown: links + auth-aware right cluster actions, animated.
          Mirrors the left cluster and the desktop right cluster. Authed:
          Dashboard link + Log out (reuses the shared useLogout handler). Unauth:
          the "Sign in/up" CTA. The desktop bell is an icon-only affordance, so
          it is not mirrored here. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl glass-strong p-2 md:hidden"
          >
            <ul className="flex flex-col">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {authed ? (
                <>
                  <li className="p-2">
                    <Button asChild size="lg" variant="ghost" className="w-full">
                      <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                  </li>
                  <li className="p-2">
                    <Button
                      type="button"
                      size="lg"
                      variant="ghost"
                      className="w-full"
                      loading={loggingOut}
                      onClick={handleLogout}
                    >
                      Log out
                    </Button>
                  </li>
                </>
              ) : (
                <li className="p-2">
                  <Button asChild size="lg" className="w-full">
                    <Link href="/login" onClick={() => setMenuOpen(false)}>
                      Sign in/up
                    </Link>
                  </Button>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
