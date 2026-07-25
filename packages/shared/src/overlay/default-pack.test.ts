// @vitest-environment node
/// <reference lib="dom" />
import { describe, it, expect } from "vitest";

/**
 * Default Pack tests.
 *
 * The Default Pack is the first bundled Effect Pack for the Live Event
 * Platform. These tests assert its version, effect set, asset set, and that
 * the embedded manifest hashes and signatures validate against the bundled
 * asset bytes.
 */

describe("default pack", () => {
  it("validates with all bundled asset bytes", async () => {
    const { validatePack } = await import("./effect-packs");
    const { defaultPackManifest, defaultPackAssets } = await import("./default-pack");
    const res = await validatePack(defaultPackManifest, { assets: defaultPackAssets });
    expect(res.ok).toBe(true);
  });

  it("has an immutable version identifier", async () => {
    const { defaultPackManifest } = await import("./default-pack");
    expect(defaultPackManifest.version).toBe("1.0.0");
  });

  it("contains exactly the four specified Donation Effects", async () => {
    const { defaultPackManifest } = await import("./default-pack");
    expect(Object.keys(defaultPackManifest.effects).sort()).toEqual([
      "jump-scare",
      "screen-cover",
      "screen-flash",
      "tunnel-vision",
    ]);
  });

  it("declares four bundled assets", async () => {
    const { defaultPackManifest } = await import("./default-pack");
    expect(Object.keys(defaultPackManifest.assets).sort()).toEqual([
      "jump-scare-1",
      "jump-scare-2",
      "jump-scare-3",
      "jump-scare-audio",
    ]);
  });

  it("jump scare uses three media assets and one audio asset", async () => {
    const { defaultPackManifest } = await import("./default-pack");
    const jumpScare = defaultPackManifest.effects["jump-scare"];
    expect(jumpScare.assetIds).toEqual(["jump-scare-1", "jump-scare-2", "jump-scare-3"]);
    expect(jumpScare.audioId).toBe("jump-scare-audio");
    expect(jumpScare.maxDisplayPct).toBe(80);
  });

  it("matches declared asset hashes to the bundled bytes", async () => {
    const { sha256Hex } = await import("./effect-packs");
    const { defaultPackManifest, defaultPackAssets } = await import("./default-pack");
    for (const [id, asset] of Object.entries(defaultPackManifest.assets)) {
      const bytes = defaultPackAssets[id];
      expect(bytes).toBeDefined();
      const hash = await sha256Hex(bytes);
      expect(hash).toBe(asset.hash);
    }
  });

  it("rejects the pack when bundled asset bytes are tampered", async () => {
    const { validatePack } = await import("./effect-packs");
    const { defaultPackManifest, defaultPackAssets } = await import("./default-pack");
    const tampered = { ...defaultPackAssets };
    tampered["jump-scare-1"] = new Uint8Array([0xff]);
    const res = await validatePack(defaultPackManifest, { assets: tampered });
    expect(res).toEqual({ ok: false, error: "invalid_hash" });
  });
});
