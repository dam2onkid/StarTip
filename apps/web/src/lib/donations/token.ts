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
