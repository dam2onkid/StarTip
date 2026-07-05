// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * lib/donations/validation — `validateMessage` / `validateDonorName`.
 *
 * Pure input-length policy used at the prepare boundary so an over-limit
 * `message` or `donor_name` is rejected with a clear 400 before any pending
 * row is inserted or any on-chain transaction is built. Limits: `message` <=
 * 280 chars, `donor_name` <= 32 chars (matching the Handle max for symmetry).
 *
 * `null` / `undefined` are accepted (the prepare path substitutes its own
 * defaults), so the validators only police the upper bound.
 */

describe("validateMessage", () => {
  it("accepts a message within the 280-char limit", async () => {
    const { validateMessage } = await import("@/lib/donations/validation");
    expect(validateMessage("Great stream!")).toEqual({ ok: true });
  });

  it("accepts null/undefined message", async () => {
    const { validateMessage } = await import("@/lib/donations/validation");
    expect(validateMessage(null)).toEqual({ ok: true });
    expect(validateMessage(undefined)).toEqual({ ok: true });
  });

  it("accepts a message exactly 280 chars", async () => {
    const { validateMessage, MESSAGE_MAX_LENGTH } = await import("@/lib/donations/validation");
    const msg = "a".repeat(MESSAGE_MAX_LENGTH);
    expect(validateMessage(msg)).toEqual({ ok: true });
  });

  it("rejects a message over 280 chars with invalid_message", async () => {
    const { validateMessage, MESSAGE_MAX_LENGTH } = await import("@/lib/donations/validation");
    const msg = "a".repeat(MESSAGE_MAX_LENGTH + 1);
    const res = validateMessage(msg);
    expect(res).toEqual({ ok: false, error: "invalid_message" });
  });
});

describe("validateDonorName", () => {
  it("accepts a donor name within the 32-char limit", async () => {
    const { validateDonorName } = await import("@/lib/donations/validation");
    expect(validateDonorName("Pat")).toEqual({ ok: true });
  });

  it("accepts null/undefined donor name", async () => {
    const { validateDonorName } = await import("@/lib/donations/validation");
    expect(validateDonorName(null)).toEqual({ ok: true });
    expect(validateDonorName(undefined)).toEqual({ ok: true });
  });

  it("accepts a donor name exactly 32 chars", async () => {
    const { validateDonorName, DONOR_NAME_MAX_LENGTH } = await import("@/lib/donations/validation");
    const name = "a".repeat(DONOR_NAME_MAX_LENGTH);
    expect(validateDonorName(name)).toEqual({ ok: true });
  });

  it("rejects a donor name over 32 chars with invalid_donor_name", async () => {
    const { validateDonorName, DONOR_NAME_MAX_LENGTH } = await import("@/lib/donations/validation");
    const name = "a".repeat(DONOR_NAME_MAX_LENGTH + 1);
    const res = validateDonorName(name);
    expect(res).toEqual({ ok: false, error: "invalid_donor_name" });
  });
});
