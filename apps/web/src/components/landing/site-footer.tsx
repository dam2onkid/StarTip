import Link from "next/link";
import Image from "next/image";

/**
 * Footer. A frosted-glass band that closes the page with a final CTA echo and
 * the minimal set of links. The single Tertiary accent is reserved for the
 * hero CTA at rest, so the footer CTA uses a ghost variant; the lime appears
 * only as a tiny status dot and the brand mark. Static Server Component.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto border-t border-foreground/10">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="flex flex-col gap-12 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-sm flex-col gap-4">
            <Link
              href="/"
              className="group relative inline-flex h-9 items-center"
              aria-label="StarTip home"
            >
              <Image
                src="/logo.png"
                alt="StarTip"
                width={140}
                height={36}
                className="h-9 w-auto transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Fast, global tips for livestream creators, settled on Stellar.
              Every donation is bound to an on-chain proof the platform cannot
              forge.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-12 gap-y-3 sm:grid-cols-3"
          >
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Product
              </p>
              <Link
                href="/login"
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                Sign in/up
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                Dashboard
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Explore
              </p>
              <Link
                href="#how-it-works"
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                How it works
              </Link>
              <Link
                href="#built-on-stellar"
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                Built on Stellar
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Network
              </p>
              <span className="flex items-center gap-2 text-sm text-foreground/80">
                <span
                  aria-hidden
                  className="inline-block size-1.5 animate-pulse rounded-full bg-primary"
                />
                Stellar Testnet
              </span>
            </div>
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-foreground/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            © {new Date().getFullYear()} StarTip
          </p>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            Built for the Stellar hackathon
          </p>
        </div>
      </div>
    </footer>
  );
}
