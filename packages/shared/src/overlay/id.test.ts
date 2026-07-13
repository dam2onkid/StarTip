// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * generateOverlayId produces an opaque, URL-safe token used to address the
 * private OBS browser source. The format is deliberately implementation-agnostic
 * at the call sites: tests only assert the observable contract.
 */

describe("generateOverlayId", () => {
  it("returns a 32-character lowercase hex string", async () => {
    const { generateOverlayId } = await import("./id");
    const id = generateOverlayId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toMatch(/-/);
  });

  it("returns a different value on each call", async () => {
    const { generateOverlayId } = await import("./id");
    const a = generateOverlayId();
    const b = generateOverlayId();
    expect(a).not.toBe(b);
  });

  it("ensureOverlayId returns an existing id or generates a new one", async () => {
    const { ensureOverlayId, generateOverlayId } = await import("./id");
    expect(ensureOverlayId({ overlay_id: "existing000overlay000id000000000" })).toBe(
      "existing000overlay000id000000000",
    );
    const generated = ensureOverlayId({});
    expect(generated).toMatch(/^[0-9a-f]{32}$/);
    expect(generated).not.toBe("existing000overlay000id000000000");
    expect(ensureOverlayId({ overlay_id: null })).toMatch(/^[0-9a-f]{32}$/);
  });
});
