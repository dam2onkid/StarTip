import { rawToDisplayAmount } from "@/lib/stellar/amount";

/**
 * Token allowlist row shape, mirrored from the `tokens` table by the indexer
 * and read publicly by the donate form and the creator dashboard. Kept in a
 * standalone module so it can be shared without pulling in the (now removed)
 * prepare logic.
 */
export interface TokenAllowlistEntry {
  contract_address: string;
  symbol: string;
  name: string | null;
  issuer: string | null;
  decimals: number;
  icon_url: string | null;
}

/**
 * Build a lookup map from a token allowlist keyed by `contract_address`.
 * Safe for client and server use.
 */
export function buildTokenMap(
  tokens: TokenAllowlistEntry[] | undefined,
): Map<string, TokenAllowlistEntry> {
  const map = new Map<string, TokenAllowlistEntry>();
  if (!tokens) return map;
  for (const token of tokens) {
    map.set(token.contract_address, token);
  }
  return map;
}

/**
 * Convert a raw i128 amount to human-readable display units using the token's
 * decimals and symbol from the allowlist map. Falls back to the raw contract
 * address as symbol and `decimals = 0` when the token is not in the map, so
 * unknown tokens still display a stable amount and identifier.
 */
export function getTokenDisplay(
  rawAmount: string,
  tokenContract: string | null | undefined,
  tokenMap: Map<string, TokenAllowlistEntry>,
): { amount: string; symbol: string } {
  const entry = tokenContract ? tokenMap.get(tokenContract) : undefined;
  const decimals = entry?.decimals ?? 0;
  const symbol = entry?.symbol ?? tokenContract ?? "";
  return { amount: rawToDisplayAmount(rawAmount, decimals), symbol };
}
