import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Isomorphic Handle helpers (safe in both Server and Client Components).
 *
 * `normalizeHandle` and the sha256 helpers live here so the client-side
 * onboarding register path (`lib/onboarding/register.ts`) can compute
 * `handle_hash = sha256(handle)` for the `register_creator` invocation without
 * pulling in `node:crypto` or the `server-only` marker. The hash uses
 * `StellarSdk.hash`, which is browser-safe (the same SDK the donate flow uses
 * client-side) and byte-identical to `node:crypto`'s `sha256`.
 */

/** Handle rules: 3-32 chars, lowercase alphanumeric, hyphens, underscores. */
const HANDLE_RE = /^[a-z0-9_-]{3,32}$/;

export interface NormalizedHandle {
  ok: boolean;
  value?: string;
  error?: "invalid" | "too_short" | "too_long";
}

/** Trim, lowercase, and validate a Handle against the canonical rules. */
export function normalizeHandle(input: string): NormalizedHandle {
  const value = input.trim().toLowerCase();
  if (value.length === 0) return { ok: false, error: "invalid" };
  if (value.length < 3) return { ok: false, error: "too_short" };
  if (value.length > 32) return { ok: false, error: "too_long" };
  if (!HANDLE_RE.test(value)) return { ok: false, error: "invalid" };
  return { ok: true, value };
}

/** sha256(normalized handle) as a 32-byte Buffer. This is the on-chain key. */
export function handleHashBuffer(handle: string): Buffer {
  return Buffer.from(StellarSdk.hash(Buffer.from(handle.trim().toLowerCase(), "utf8")));
}

/** Lowercase hex of `handleHashBuffer` (no `\x` prefix). */
export function handleHashHex(handle: string): string {
  return handleHashBuffer(handle).toString("hex");
}
