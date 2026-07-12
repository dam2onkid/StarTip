"use client";

import * as React from "react";
import { donorHasTrustline } from "@/lib/donations/trustline-check";
import { getRpc } from "@/lib/stellar/client";
import type { TokenAllowlistEntry } from "@/lib/donations/token";

interface TrustlineResult {
  /** `null` while the lookup is in flight or the key is stale. */
  hasTrustline: boolean | null;
  /** Identifies which (walletAddress, token) pair the result belongs to. */
  key: string | null;
}

/**
 * Focused hook for checking whether the connected donor has a trustline to the
 * selected allowlist token. Returns `null` when no wallet is connected, no
 * token is selected, or the lookup is still in flight.
 *
 * The lookup is skipped when there is no wallet or no selection, so the form
 * never shows stale guidance. The lookup short-circuits to `true` for native
 * XLM inside `donorHasTrustline`.
 */
export function useTrustline(
  walletAddress: string | null,
  token: TokenAllowlistEntry | null,
): boolean | null {
  const [result, setResult] = React.useState<TrustlineResult>({
    hasTrustline: null,
    key: null,
  });

  React.useEffect(() => {
    if (!walletAddress || !token) return;

    let cancelled = false;
    const currentKey = `${walletAddress}:${token.contract_address}`;
    donorHasTrustline(getRpc(), walletAddress, token).then((value) => {
      if (!cancelled) {
        setResult({ hasTrustline: value, key: currentKey });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, token]);

  const key = walletAddress && token ? `${walletAddress}:${token.contract_address}` : null;
  return key && result.key === key ? result.hasTrustline : null;
}
