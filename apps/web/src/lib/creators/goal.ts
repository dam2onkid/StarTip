/**
 * Donation goal progress aggregation.
 *
 * A Creator sets a donation goal (a target amount denominated in a single
 * token from the allowlist) for their profile. The dashboard renders a
 * progress card (current amount vs. target), the public Creator profile renders
 * a progress bar, and the overlay shows the progress to stream viewers.
 *
 * `amount` and `targetAmount` are raw i128 numeric strings (the same units
 * stored on the `donations` row and the `donation_goals.target_amount`
 * column). They are summed with `BigInt` so arbitrary-precision values
 * (low-decimals tokens can exceed `Number.MAX_SAFE_INTEGER`) are handled
 * exactly. The displayed total is the raw integer; the UI converts to display
 * units using the token's `decimals` when needed.
 *
 * The module has no `server-only` marker and imports nothing, so it is safe to
 * import from client components, server components, and tests alike.
 *
 * Mirrors the `aggregateLeaderboard` / `sumDonationStats` pattern in
 * `leaderboard.ts`.
 */

/** A donation with the fields the aggregation needs. */
export interface GoalDonationRow {
  /** SAC contract address, matching `donations.token` and `donation_goals.token`. */
  token: string;
  /** Raw i128 numeric string. */
  amount: string;
}

/** The goal target the progress is measured against. */
export interface GoalTarget {
  /** SAC contract address; only donations with this token contribute. */
  token: string;
  /** Raw i128 numeric string. */
  targetAmount: string;
}

export interface GoalProgress {
  /** Raw i128 numeric string: the sum of the goal's-token donations. */
  current: string;
  /** Raw i128 numeric string: the target, echoed back. */
  target: string;
  /** Integer percentage of the target reached, clamped to 0-100. */
  pct: number;
}

/**
 * Sum the raw `amount` of donations in the goal's token and compute the
 * percentage of the target reached. `pct` is floored to an integer and
 * clamped to 0-100. A target of `0` yields `pct = 0` (avoids divide-by-zero).
 * Non-numeric `amount` rows are skipped (defensive: a malformed row never
 * corrupts the total).
 */
export function goalProgress(
  donations: GoalDonationRow[] | null | undefined,
  target: GoalTarget,
): GoalProgress {
  let current = BigInt(0);
  if (donations && donations.length > 0) {
    for (const row of donations) {
      if (row.token !== target.token) continue;
      try {
        current += BigInt(row.amount);
      } catch {
        continue;
      }
    }
  }

  let targetBig: bigint;
  try {
    targetBig = BigInt(target.targetAmount);
  } catch {
    targetBig = BigInt(0);
  }

  let pct = 0;
  if (targetBig > BigInt(0)) {
    // Floor to an integer percentage, then clamp to 0-100.
    const ratio = (current * BigInt(100)) / targetBig;
    if (ratio > BigInt(100)) pct = 100;
    else if (ratio < BigInt(0)) pct = 0;
    else pct = Number(ratio);
  }

  return {
    current: current.toString(),
    target: targetBig.toString(),
    pct,
  };
}
