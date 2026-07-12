import { createElement } from "react";
import type { Status } from "./types";

export function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "busy") {
    return status.kind === "busy"
      ? createElement(
          "p",
          { className: "text-xs text-muted-foreground", "aria-live": "polite" },
          "Working…",
        )
      : null;
  }
  if (status.kind === "info") {
    return createElement(
      "p",
      { className: "text-xs text-primary", "aria-live": "polite" },
      status.message,
    );
  }
  return createElement(
    "p",
    {
      className: "text-xs text-destructive",
      "aria-live": "polite",
      role: "alert",
    },
    status.message,
  );
}

export function humanError(code: string): string {
  switch (code) {
    case "invalid_handle":
      return "Handle must be 3-32 lowercase letters, numbers, hyphens, or underscores.";
    case "already_registered":
      return "You are already a registered Creator.";
    case "handle_taken":
      return "That handle is taken.";
    case "no_handle":
      return "Claim a handle first.";
    case "already_linked":
      return "A wallet is already linked and registered on-chain.";
    case "signer_mismatch":
      return "The signing wallet does not match the address you provided.";
    case "nonce_missing":
    case "nonce_expired":
      return "The link challenge expired. Request a new one.";
    case "invalid_signature":
      return "Signature verification failed.";
    case "invalid_address":
      return "That does not look like a valid Stellar address.";
    case "unauthorized":
      return "Your session expired. Please log in again.";
    case "profile_not_found":
      return "Profile not found. Please log in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function overlaySettingsErrorMessage(code: string): string {
  if (code === "unauthorized") return "Sign in again to save overlay settings.";
  if (code === "not_creator") return "Claim a handle first.";
  return humanError(code);
}

export function goalErrorMessage(code: string): string {
  if (code === "unauthorized") return "Sign in again to save your goal.";
  if (code === "not_creator") return "Claim a handle first.";
  if (code === "forbidden") return "You can only set your own goal.";
  if (code === "token_not_allowed") return "That token is not on the allowlist.";
  return humanError(code);
}

/** Compute a clamped 0-100 integer percentage from two raw numeric strings. */
export function computePct(currentRaw: string, targetRaw: string): number {
  let current: bigint;
  let target: bigint;
  try {
    current = BigInt(currentRaw);
    target = BigInt(targetRaw);
  } catch {
    return 0;
  }
  if (target <= BigInt(0)) return 0;
  const ratio = (current * BigInt(100)) / target;
  if (ratio > BigInt(100)) return 100;
  if (ratio < BigInt(0)) return 0;
  return Number(ratio);
}
