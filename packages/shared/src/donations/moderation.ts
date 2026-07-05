/**
 * MVP moderation policy: a small, fixed list of obvious banned words. The list
 * is intentionally short to avoid false positives; the Creator can always
 * un-hide a false positive from the moderation list. Not admin-configurable in
 * the MVP (admin ops run via the `stellar` CLI per ADR-0001, and the keyword
 * list is off-chain, so it lives in code).
 *
 * Matching is case-insensitive substring: a banned keyword matches if it
 * appears anywhere in the `message` or `donor_name`. This is the single source
 * of truth used by prepare, confirm, and the indexer insert fallback, so a
 * flagged donation is never briefly visible on the Overlay before a second
 * pass hides it (ADR-0003).
 */
export const BANNED_KEYWORDS: readonly string[] = [
  "spam",
  "scam",
  "abuse",
  "hate",
  "racism",
] as const;

export type ModerationStatus = "visible" | "auto_hidden";

/**
 * Classify a donation's `message` and `donor_name` against the banned-keyword
 * list. Returns `'auto_hidden'` when any banned keyword appears (case-
 * insensitive substring match) in either field, `'visible'` otherwise.
 *
 * `null` / `undefined` / empty inputs are treated as clean: an anonymous
 * donation with no message has nothing to filter, so it is `visible`. The
 * on-chain Donation is never blocked by moderation; only the Overlay visibility
 * is affected.
 */
export function classifyMessage(
  message: string | null | undefined,
  donorName: string | null | undefined,
): ModerationStatus {
  const haystack = `${message ?? ""} ${donorName ?? ""}`.toLowerCase();
  if (!haystack) return "visible";
  for (const keyword of BANNED_KEYWORDS) {
    if (haystack.includes(keyword.toLowerCase())) return "auto_hidden";
  }
  return "visible";
}
