"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Share menu for a public Creator page. Renders a single ghost icon button
 * that opens a dropdown with X (Twitter), Facebook, and a copy-link action.
 *
 * The share URL is resolved on the client from `window.location.href` so the
 * component works on any Creator route without a server-supplied origin. Until
 * the URL is known (first effect run), the social links fall back to a
 * relative path, which the share targets resolve against their own referrer.
 *
 * Visual language follows DESIGN.md: ghost neutral surface, single lime
 * accent reserved for the copy-success confirmation state only.
 */
export function ShareButtons({
  displayName,
  className,
}: {
  displayName: string;
  className?: string;
}) {
  // Resolve the share URL lazily from the browser on first render so we never
  // call setState inside an effect (which would cascade). On SSR this is the
  // empty string; the social targets resolve a relative URL against their own
  // referrer, and the copy fallback reads window.location at click time.
  const [url] = React.useState<string>(() =>
    typeof window !== "undefined" ? window.location.href : "",
  );
  const [copied, setCopied] = React.useState(false);

  const shareText = `Support ${displayName} on StarTip`;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(shareText);
  const xHref = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

  const copy = React.useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url || (typeof window !== "undefined" ? window.location.href : ""));
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable (permissions, non-secure context);
      // fail silently rather than disrupting the share flow.
    }
  }, [url]);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Share ${displayName}'s profile`}
          data-cursor="hover"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-md border border-foreground/10 bg-card/60 text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            className,
          )}
        >
          <Share2 className="size-4" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 overflow-hidden rounded-lg border border-foreground/10 bg-popover/95 p-1 text-sm shadow-xl backdrop-blur-md"
        >
          <DropdownMenu.Item asChild>
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.91l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>Share on X</span>
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a
              href={fbHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12" />
              </svg>
              <span>Share on Facebook</span>
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-foreground/10" />
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              void copy();
            }}
            className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent data-[highlighted]:bg-accent"
          >
            {copied ? (
              <Check className="size-4 text-primary" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            <span>{copied ? "Link copied" : "Copy link"}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
