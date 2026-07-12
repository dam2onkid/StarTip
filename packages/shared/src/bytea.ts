/**
 * Postgres `bytea` values travel over the PostgREST API as hex strings with the
 * `\x` prefix: that is how Postgres casts text to bytea and how PostgREST
 * encodes bytea in JSON responses. These helpers centralize that formatting so
 * callers never build the prefix by hand.
 */

/**
 * Convert a raw byte buffer to the Postgres `bytea` hex literal format used by
 * PostgREST (`\x<hex>`). Accepts `Buffer` or `Uint8Array` inputs.
 */
export function toByteaHex(bytes: Uint8Array): string {
  return "\\x" + Buffer.from(bytes).toString("hex");
}
