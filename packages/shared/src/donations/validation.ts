/**
 * MVP input-length policy for the donation prepare boundary. Limits: `message`
 * <= 280 chars, `donor_name` <= 32 chars (matching the Handle max for
 * symmetry). Enforced in `prepareDonation` so an over-limit input is rejected
 * with a clear 400 before any pending row is inserted or any on-chain
 * transaction is built.
 */
export const MESSAGE_MAX_LENGTH = 280;
export const DONOR_NAME_MAX_LENGTH = 32;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: "invalid_message" | "invalid_donor_name" };

/**
 * Validate the donation `message` length. `null` / `undefined` are accepted
 * (the prepare path substitutes its own default), so this only polices the
 * upper bound.
 */
export function validateMessage(message: string | null | undefined): ValidationResult {
  if (message == null) return { ok: true };
  if (typeof message !== "string") return { ok: false, error: "invalid_message" };
  if (message.length > MESSAGE_MAX_LENGTH) return { ok: false, error: "invalid_message" };
  return { ok: true };
}

/**
 * Validate the `donor_name` length. `null` / `undefined` are accepted (the
 * prepare path substitutes `"Anonymous"`), so this only polices the upper
 * bound.
 */
export function validateDonorName(name: string | null | undefined): ValidationResult {
  if (name == null) return { ok: true };
  if (typeof name !== "string") return { ok: false, error: "invalid_donor_name" };
  if (name.length > DONOR_NAME_MAX_LENGTH) return { ok: false, error: "invalid_donor_name" };
  return { ok: true };
}
