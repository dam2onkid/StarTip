"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/landing/magnetic";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Fluid, contextual navigation (premium-frontend-ui skill §2.3).
 *
 * A floating glass pill detached from the viewport edges. Hides on scroll-down,
 * reveals on scroll-up, and intensifies its frost once the user scrolls past
 * the hero. A thin lime scroll-progress bar tracks page progress on the pill's
 * top edge. Desktop links carry an animated underline and highlight the active
 * section via scroll-spy. The CTA is magnetic with a lime glow on hover.
 *
 * Breakpoint strategy: a single `md` split. Below `md` the pill shows logo +
 * hamburger only; the links and CTA live in an animated dropdown. At `md` and
 * above the pill shows logo + links + CTA, and the hamburger is hidden. This
 * avoids the redundant CTA-in-pill + CTA-in-dropdown + CTA-in-hero triple
 * repeat on small screens.
 *
 * Only `transform` and `opacity` are animated. On touch devices and when
 * `prefers-reduced-motion: reduce` is set, the header stays fixed and visible
 * and the mobile menu uses plain show/hide.
 */
const LINKS = [
  { label: "How it works", href: "#how-it-works", id: "how-it-works" },
  { label: "Built on Stellar", href: "#built-on-stellar", id: "built-on-stellar" },
] as const;

export function SiteNav() {
  const reduced = usePrefersReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Scroll-spy: highlight the link whose section is currently in view.
  React.useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(latest > 24);
    if (reduced) return;
    if (latest > prev && latest > 160 && !menuOpen) setHidden(true);
    else setHidden(false);
  });

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

  return (
    <motion.header
      initial={false}
      animate={!reduced ? { y: hidden ? "-140%" : "0%" } : undefined}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5"
    >
      <nav
        aria-label="Primary"
        className={cn(
          "relative mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl px-4 py-2.5 transition-[background,backdrop-filter,border-color,box-shadow] duration-300 sm:px-5",
          scrolled || menuOpen
            ? "glass-strong shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]"
            : "border border-transparent bg-transparent",
        )}
      >
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
            const active = activeId === link.id;
            return (
              <li key={link.href}>
                <Magnetic strength={0.2} className="inline-block">
                  <Link
                    href={link.href}
                    aria-current={active ? "true" : undefined}
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

        {/* Right cluster: CTA (desktop) + mobile toggle */}
        <div className="flex items-center gap-2">
          <Magnetic strength={0.4} className="hidden md:inline-block">
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="group/cta relative overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-[0_0_24px_-6px_rgba(180,255,57,0.4)]"
            >
              <Link href="/login" className="relative z-10">
                Become a Creator
              </Link>
            </Button>
          </Magnetic>

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

      {/* Mobile dropdown — links + CTA, animated */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl glass-strong p-2 md:hidden"
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
              <li className="p-2">
                <Button asChild size="lg" className="w-full">
                  <Link href="/login" onClick={() => setMenuOpen(false)}>
                    Become a Creator
                  </Link>
                </Button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
