// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * lib/donations/moderation — `classifyMessage`.
 *
 * Pure policy function: case-insensitive substring match of the donation
 * `message` and `donor_name` against a fixed MVP banned-words array. Returns
 * `'auto_hidden'` when any banned keyword appears in either field, `'visible'`
 * otherwise. Empty/null/undefined inputs are treated as clean (no keyword can
 * match), so an anonymous donation with no message is always `visible`.
 *
 * This is the single source of truth used by prepare, confirm, and the indexer
 * insert fallback, so a flagged donation is never briefly visible on the
 * Overlay before a second pass hides it (ADR-0003).
 */

describe("classifyMessage", () => {
  it("returns 'visible' for a clean message and donor name", async () => {
    const { classifyMessage } = await import("./moderation");
    expect(classifyMessage("Great stream!", "Pat")).toBe("visible");
  });

  it("returns 'visible' for an empty message", async () => {
    const { classifyMessage } = await import("./moderation");
    expect(classifyMessage("", "Pat")).toBe("visible");
  });

  it("returns 'visible' for null/undefined message and donor name", async () => {
    const { classifyMessage } = await import("./moderation");
    expect(classifyMessage(null, null)).toBe("visible");
    expect(classifyMessage(undefined, undefined)).toBe("visible");
  });

  it("returns 'auto_hidden' when the message contains a banned keyword (case-insensitive substring)", async () => {
    const { classifyMessage, BANNED_KEYWORDS } = await import("./moderation");
    const keyword = BANNED_KEYWORDS[0];
    expect(classifyMessage(`hey ${keyword.toUpperCase()} friend`, "Pat")).toBe("auto_hidden");
  });

  it("returns 'auto_hidden' when the donor name contains a banned keyword", async () => {
    const { classifyMessage, BANNED_KEYWORDS } = await import("./moderation");
    const keyword = BANNED_KEYWORDS[0];
    expect(classifyMessage("clean message", keyword)).toBe("auto_hidden");
  });

  it("matches banned keywords as substrings, not whole words", async () => {
    const { classifyMessage, BANNED_KEYWORDS } = await import("./moderation");
    const keyword = BANNED_KEYWORDS[0];
    expect(classifyMessage(`xxx${keyword}xxx`, "Pat")).toBe("auto_hidden");
  });
});
