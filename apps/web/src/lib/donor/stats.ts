import "server-only";

/**
 * Donor stats helpers for the `/dashboard` Donor tab.
 *
 * `computeDonorRank` aggregates confirmed/indexed visible donations by
 * `user_id` (logged-in donors only; anonymous donations with a null
 * `user_id` are excluded) and returns the caller's 1-based rank and total
 * donated amount. This is the donor-side counterpart to the public
 * `aggregateLeaderboard` (which ranks by `donor_name` for display); ranking
 * by `user_id` is stable across `display_name` changes so the donor's rank
 * reflects their full tracked history.
 *
 * `amount` is the raw i128 numeric string stored on the `donations` row.
 * Sums use `BigInt` so arbitrary-precision values (low-decimals tokens can
 * exceed `Number.MAX_SAFE_INTEGER`) are handled exactly.
 */

export interface DonorRankRow {
  donor_name: string;
  amount: string;
  user_id: string | null;
  /** Creator profile id; used by the dashboard to group rows per creator for
   * per-creator rank computation. Optional so the rank helper can accept rows
   * without it (e.g. the global leaderboard). */
  creator_profile_id?: string;
}

export interface DonorRank {
  /** 1-based position on the leaderboard, or null when the user has no
   * tracked donations. Ties share the same rank (competition ranking). */
  rank: number | null;
  /** The user's total donated amount as a raw integer string. */
  total: string;
}

/**
 * Compute a logged-in donor's rank and total from a set of donation rows.
 * Anonymous donations (`user_id` is null) are excluded. Sums the raw
 * `amount` per `user_id` with `BigInt`, then derives the caller's rank as
 * the number of donors with a strictly greater total plus one (competition
 * ranking: tied donors share the same rank).
 */
export function computeDonorRank(
  rows: DonorRankRow[] | null | undefined,
  userId: string,
): DonorRank {
  if (!rows || rows.length === 0) return { rank: null, total: "0" };

  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (row.user_id === null || row.user_id === undefined) continue;
    let amount: bigint;
    try {
      amount = BigInt(row.amount);
    } catch {
      continue;
    }
    totals.set(row.user_id, (totals.get(row.user_id) ?? BigInt(0)) + amount);
  }

  const userTotal = totals.get(userId);
  if (userTotal === undefined) return { rank: null, total: "0" };

  let rank = 1;
  for (const [uid, total] of totals) {
    if (uid === userId) continue;
    if (total > userTotal) rank += 1;
  }
  return { rank, total: userTotal.toString() };
}
