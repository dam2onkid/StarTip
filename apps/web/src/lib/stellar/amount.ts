/**
 * Pure, client-safe display/raw amount conversion helpers.
 *
 * Stellar Soroban token amounts are i128 integers in raw units. These helpers
 * are re-exported from `@startip/shared/stellar/amount` so the worker, web,
 * and live-client apps share a single, tested conversion implementation.
 */

export {
  displayToRawAmount,
  isAtLeastRaw,
  rawToDisplayAmount,
} from "@startip/shared/stellar/amount";
