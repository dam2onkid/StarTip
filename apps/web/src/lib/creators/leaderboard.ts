import "server-only";

/**
 * Leaderboard aggregation for the public discovery surfaces.
 *
 * The Global Leaderboard (`/creator/explore`) ranks Donors by aggregate
 * donated amount across all Creators. The per-creator leaderboard
 * (`/creator/[handle]`) ranks Donors to a single Creator. Both exclude
 * anonymous donations: only rows with a non-null `user_id` (logged-in donors)
 * contribute, per PRD user stories 33-34.
 *
 * `amount` is the raw i128 numeric string stored on the `donations` row. It is
 * summed with `BigInt` so arbitrary-precision values (low-decimals tokens can
 * exceed `Number.MAX_SAFE_INTEGER`) are handled exactly. The displayed total
 * is the raw integer; the UI converts to display units using the token
 * decimals when needed. Cross-token summation is a known MVP simplification
 * (the PRD spec asks for "aggregate donated amount"); a single-token
 * allowlist keeps the ranking meaningful today.
 */

export interface LeaderboardRow {
  donor_name: string;
  amount: string;
  user_id: string | null;
  /** SAC contract address; used by the UI to convert the raw total to display units. */
  token?: string;
}

export interface LeaderboardEntry {
  donor_name: string;
  total_amount: string;
  /** SAC contract address for the aggregated total; the UI uses this to pick the token's decimals/symbol. */
  token?: string;
}

/**
 * Aggregate confirmed/indexed visible donations into a ranked donor
 * leaderboard. Anonymous donations (`user_id` is null) are excluded. Sums the
 * raw `amount` per `donor_name` with `BigInt`, sorts by total descending
 * (ties broken by `donor_name` ascending for a stable order), and returns the
 * top `limit` entries (default 10).
 *
 * When `token` is provided on a row, donations are grouped by `(donor_name,
 * token)` so the UI can convert each total with the correct decimals and show
 * the token symbol. The token is recorded on each `LeaderboardEntry` so the
 * caller can render display units without re-deriving the token.
 */
export function aggregateLeaderboard(
  rows: LeaderboardRow[] | null | undefined,
  limit = 10,
): LeaderboardEntry[] {
  if (!rows || rows.length === 0) return [];
  const totals = new Map<string, { total: bigint; token?: string }>();
  for (const row of rows) {
    if (row.user_id === null || row.user_id === undefined) continue;
    const name = row.donor_name;
    const token = row.token;
    const key = token ? `${name}:${token}` : name;
    let amount: bigint;
    try {
      amount = BigInt(row.amount);
    } catch {
      continue;
    }
    const existing = totals.get(key);
    totals.set(key, {
      total: (existing?.total ?? BigInt(0)) + amount,
      token: token ?? existing?.token,
    });
  }
  return Array.from(totals.entries())
    .map(([key, { total, token }]) => {
      const donor_name = key.includes(":") ? key.slice(0, key.lastIndexOf(":")) : key;
      return { donor_name, total_amount: total.toString(), token };
    })
    .sort((a, b) => {
      const byTotal = BigInt(b.total_amount) - BigInt(a.total_amount);
      if (byTotal !== BigInt(0)) return byTotal < BigInt(0) ? -1 : 1;
      return a.donor_name < b.donor_name ? -1 : a.donor_name > b.donor_name ? 1 : 0;
    })
    .slice(0, limit);
}

/**
 * Sum the raw `amount` of a set of donations (as a numeric string) and count
 * them. Used for the Creator page stats ("total received", "count"). Handles
 * arbitrary-precision amounts via `BigInt`.
 *
 * The `token` from the first row is returned on the result so the UI can
 * convert the raw total to display units. Callers should pass the token when
 * available; the helper is safe for the single-token allowlist MVP.
 */
export function sumDonationStats(
  rows: { amount: string; token?: string }[] | null | undefined,
): { total: string; count: number; token?: string } {
  if (!rows || rows.length === 0) return { total: "0", count: 0 };
  let total = BigInt(0);
  let count = 0;
  let token: string | undefined;
  for (const row of rows) {
    try {
      total += BigInt(row.amount);
      count += 1;
      if (!token && row.token) token = row.token;
    } catch {
      continue;
    }
  }
  return { total: total.toString(), count, token };
}
