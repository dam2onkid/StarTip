"use client";

import * as React from "react";
import { DropdownMenu } from "radix-ui";
import { Wallet, Copy, ExternalLink, LogOut } from "lucide-react";
import { stellarExpertAccountUrl } from "@/lib/stellar/client";
import { useDonateWallet } from "./donate-wallet-context";

/**
 * Nav Donate Wallet connector (PRD: Unified hybrid navigation, issue 02).
 *
 * Always visible in the nav right cluster in both auth states. Surfaces the
 * browser wallet connected via the Stellar Wallets Kit, not the Creator's
 * Owner Address. Never requires login, never reads or writes
 * `profiles.owner_address`.
 *
 * This component is a pure presentation surface: wallet state (address,
 * connecting, connect/disconnect) lives in `DonateWalletProvider` so the
 * navbar connector and the donate form share one source of truth and can no
 * longer disagree.
 *
 * Disconnected: a "Connect wallet" button that calls `connect()` and
 * transitions to the connected pill on success. Connected: a glass pill with
 * the truncated address that opens a dropdown with "Copy address", "View on
 * Stellar", and "Disconnect".
 */

/** `GABC…WXYZ` — first 4 and last 4 chars joined by a single ellipsis. */
function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function DonateWalletConnector() {
  const { address, connecting, connect, disconnect } = useDonateWallet();

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); the menu closes
      // either way. No nav-level error surface.
    }
  }

  if (address) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Connected wallet ${address}`}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2 text-sm text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Wallet className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-xs tracking-wide">
              {truncateAddress(address)}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 min-w-[12rem] overflow-hidden rounded-xl border border-foreground/10 bg-background/95 p-1 text-sm shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
          >
            <DropdownMenu.Item
              onSelect={handleCopy}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]"
            >
              <Copy className="size-3.5 text-muted-foreground" />
              Copy address
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <a
                href={stellarExpertAccountUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]"
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
                View on Stellar
              </a>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-foreground/10" />
            <DropdownMenu.Item
              onSelect={disconnect}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]"
            >
              <LogOut className="size-3.5 text-muted-foreground" />
              Disconnect
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={connecting}
      aria-label="Connect wallet"
      className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2 text-sm text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-[0_0_24px_-6px_rgba(180,255,57,0.4)] disabled:opacity-60"
    >
      <Wallet className="size-3.5" />
      <span>{connecting ? "Connecting…" : "Connect wallet"}</span>
    </button>
  );
}
