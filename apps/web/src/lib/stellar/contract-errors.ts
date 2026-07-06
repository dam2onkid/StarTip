/**
 * Decode Soroban contract errors into UI-facing messages.
 *
 * The donation-router contract reverts with a typed `Error` enum (see
 * `contracts/donation-router/src/lib.rs`). Soroban RPC surfaces these in two
 * string forms:
 *
 *   1. Numeric code form:  `HostError: Error(Contract, #8)` (production RPC)
 *   2. Variant name form:  `Error(AlreadyRegistered)` (some SDK / test paths)
 *
 * The raw string also carries the full diagnostic event log, contract
 * addresses, and XDR blobs, none of which belong in a user-facing toast. This
 * module extracts the code from either form and maps it to a short, actionable
 * message. Unrecognized errors fall back to the caller-provided default so the
 * UI never leaks the raw host error.
 */

/** Contract error codes from `donation-router/src/lib.rs` `Error` enum. */
export type ContractErrorCode =
  | "Unauthorized"
  | "Paused"
  | "CreatorNotFound"
  | "CreatorInactive"
  | "InvalidAmount"
  | "TokenNotAllowed"
  | "FeeCapExceeded"
  | "AlreadyRegistered";

/** Numeric code -> variant name, matching the on-chain `Error` enum order. */
const CODE_BY_NUMBER: Record<number, ContractErrorCode> = {
  1: "Unauthorized",
  2: "Paused",
  3: "CreatorNotFound",
  4: "CreatorInactive",
  5: "InvalidAmount",
  6: "TokenNotAllowed",
  7: "FeeCapExceeded",
  8: "AlreadyRegistered",
};

/** UI-facing message for each contract error code. */
export const CONTRACT_ERROR_MESSAGES: Record<ContractErrorCode, string> = {
  Unauthorized: "You are not authorized to perform this action.",
  Paused: "This action is paused right now. Try again later.",
  CreatorNotFound: "This creator is not registered on-chain yet.",
  CreatorInactive: "This creator is inactive and cannot receive donations.",
  InvalidAmount: "The amount must be greater than zero.",
  TokenNotAllowed: "This token is not in the allowed list.",
  FeeCapExceeded: "The platform fee exceeds the configured cap.",
  AlreadyRegistered:
    "This handle is already registered on-chain. If it is yours, connect the wallet that registered it and reconcile from the dashboard.",
};

/**
 * Extract the contract error code from a Soroban error string. Accepts both
 * the numeric form `Error(Contract, #N)` and the variant form
 * `Error(VariantName)`. Returns `null` when no recognized code is found.
 */
export function decodeContractErrorCode(error: string): ContractErrorCode | null {
  if (!error) return null;
  // Numeric form: Error(Contract, #8)
  const byNumber = /Error\(Contract,\s*#(\d+)\)/.exec(error);
  if (byNumber) {
    const code = CODE_BY_NUMBER[Number(byNumber[1])];
    if (code) return code;
  }
  // Variant name form: Error(AlreadyRegistered)
  const byName = /Error\((\w+)\)/.exec(error);
  if (byName) {
    const name = byName[1] as ContractErrorCode;
    if (name in CONTRACT_ERROR_MESSAGES) return name;
  }
  return null;
}

/**
 * Map any thrown value (typically an `Error` from the stellar-sdk pipeline) to
 * a UI-facing message. Recognized contract errors get their specific message;
 * everything else gets the caller's `fallback` so raw host errors with
 * diagnostic logs and contract addresses never reach the user.
 */
export function friendlyOnchainError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    const code = decodeContractErrorCode(err.message);
    if (code) return CONTRACT_ERROR_MESSAGES[code];
  }
  return fallback;
}
