"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { TokenAllowlistEntry } from "@/lib/donations/token";

export type TokenLoadState = "loading" | "ready" | "empty" | "error";

/**
 * Focused hook for loading the public token allowlist from `tokens`.
 *
 * The `tokens` table has a public SELECT RLS policy (ADR: the token picker is
 * public, no RPC call per prepare). The hook returns the loaded rows plus a
 * status so the UI can show loading / empty / error states.
 */
export function useTokenAllowlist(): {
  tokens: TokenAllowlistEntry[];
  status: TokenLoadState;
} {
  const [tokens, setTokens] = React.useState<TokenAllowlistEntry[]>([]);
  const [status, setStatus] = React.useState<TokenLoadState>("loading");

  React.useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("tokens")
      .select("contract_address,symbol,name,issuer,decimals,icon_url")
      .then(({ data, error: fetchErr }) => {
        if (fetchErr || !data) {
          setStatus("error");
          return;
        }
        const nextTokens = data as TokenAllowlistEntry[];
        setTokens(nextTokens);
        setStatus(nextTokens.length > 0 ? "ready" : "empty");
      });
  }, []);

  return { tokens, status };
}
