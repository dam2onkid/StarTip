// @vitest-environment node
/// <reference lib="dom" />
import { describe, it, expect, beforeAll } from "vitest";

/**
 * Effect Packs contract tests.
 *
 * These tests exercise the shared pack manifest, signature, hash, and content
 * policy boundaries. A fresh ECDSA P-256 key pair is generated once so each
 * test can build signed packs without depending on the bundled Default Pack.
 */

type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };

let keyPair: KeyPair;
let publicKeyBase64: string;

beforeAll(async () => {
  const generated = await globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  keyPair = generated as KeyPair;
  const spki = await globalThis.crypto.subtle.exportKey("spki", keyPair.publicKey);
  publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
});

async function makeMinimalPack(
  overrides: Record<string, unknown> = {},
  assetIds?: string[],
): Promise<Record<string, unknown>> {
  const { canonicalizeForHash, sha256Hex } = await import("./effect-packs");

  const assets: Record<string, unknown> = {};
  if (assetIds) {
    for (const id of assetIds) {
      const bytes = new Uint8Array([0x00, 0x01, 0x02]);
      const hash = await sha256Hex(bytes);
      assets[id] = {
        id,
        type: id.endsWith("-gif") ? "gif" : "image",
        path: `assets/${id}.png`,
        hash,
        contentType: id.endsWith("-gif") ? "image/gif" : "image/png",
      };
    }
  }

  const effects: Record<string, unknown> = {
    "screen-flash": {
      id: "screen-flash",
      name: "Screen Flash",
      type: "screen-flash",
      durationMs: 1000,
    },
  };

  const id = "test-pack";
  const version = "1.0.0";
  const publicKey = publicKeyBase64;
  const payload = canonicalizeForHash({ id, version, effects, assets, publicKey });
  const manifestHash = await sha256Hex(payload);

  const signatureBuffer = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payload),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return {
    id,
    version,
    effects,
    assets,
    publicKey,
    manifestHash,
    signature,
    ...overrides,
  };
}

async function signPackWithKey(manifest: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { canonicalizeForHash, sha256Hex } = await import("./effect-packs");
  const { manifestHash, signature, publicKey, ...rest } = manifest;
  const payload = canonicalizeForHash({ ...rest, publicKey });
  const newHash = await sha256Hex(payload);
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payload),
  );
  const newSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return { ...rest, publicKey, manifestHash: newHash, signature: newSignature };
}

describe("validatePack", () => {
  it("accepts a valid minimal pack", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await makeMinimalPack();
    const res = await validatePack(manifest);
    expect(res).toEqual({
      ok: true,
      manifest: expect.objectContaining({ id: "test-pack" }),
      effectIds: ["screen-flash"],
      assetIds: [],
    });
  });

  it("rejects an invalid signature", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await makeMinimalPack({ signature: "aW52YWxpZCBzaWduYXR1cmU=" });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects an invalid manifest hash", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await makeMinimalPack({ manifestHash: "0".repeat(64) });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "invalid_hash" });
  });

  it("rejects an invalid version", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({ ...(await makeMinimalPack()), version: "not-a-version" });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "invalid_version" });
  });

  it("rejects an undeclared asset referenced by an effect", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack()),
      effects: {
        "screen-flash": {
          id: "screen-flash",
          name: "Screen Flash",
          type: "screen-flash",
          durationMs: 1000,
          assetIds: ["ghost"],
        },
      },
    });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "undeclared_asset" });
  });

  it("rejects a remote asset URL", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack()),
      assets: {
        "remote-asset": {
          id: "remote-asset",
          type: "image",
          path: "https://evil.example.com/x.png",
          hash: "0".repeat(64),
          contentType: "image/png",
        },
      },
      effects: {
        "screen-flash": {
          id: "screen-flash",
          name: "Screen Flash",
          type: "screen-flash",
          durationMs: 1000,
          assetIds: ["remote-asset"],
        },
      },
    });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "remote_asset_url" });
  });

  it("rejects executable pack content", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack()),
      assets: {
        "bad-asset": {
          id: "bad-asset",
          type: "image",
          path: "assets/bad.js",
          hash: "0".repeat(64),
          contentType: "image/png",
        },
      },
      effects: {
        "screen-flash": {
          id: "screen-flash",
          name: "Screen Flash",
          type: "screen-flash",
          durationMs: 1000,
          assetIds: ["bad-asset"],
        },
      },
    });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "executable_pack_content" });
  });

  it("rejects an executable content type", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack()),
      assets: {
        "bad-asset": {
          id: "bad-asset",
          type: "image",
          path: "assets/bad.png",
          hash: "0".repeat(64),
          contentType: "application/javascript",
        },
      },
      effects: {
        "screen-flash": {
          id: "screen-flash",
          name: "Screen Flash",
          type: "screen-flash",
          durationMs: 1000,
          assetIds: ["bad-asset"],
        },
      },
    });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "executable_pack_content" });
  });

  it("rejects a forbidden script field in an effect", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack()),
      effects: {
        "screen-flash": {
          id: "screen-flash",
          name: "Screen Flash",
          type: "screen-flash",
          durationMs: 1000,
          script: "alert(1)",
        },
      },
    });
    const res = await validatePack(manifest);
    expect(res).toEqual({ ok: false, error: "executable_pack_content" });
  });

  it("rejects an asset hash mismatch when bytes are supplied", async () => {
    const { validatePack, sha256Hex } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack({}, ["asset-1"])),
      effects: {
        "jump-scare": {
          id: "jump-scare",
          name: "Jump Scare",
          type: "jump-scare",
          assetIds: ["asset-1"],
        },
      },
    });
    const wrongBytes = new Uint8Array([0xff]);
    const assets = { "asset-1": wrongBytes };
    const res = await validatePack(manifest, { assets });
    expect(res).toEqual({ ok: false, error: "invalid_hash" });
  });

  it("accepts an asset hash match when bytes are supplied", async () => {
    const { validatePack, sha256Hex } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack({}, ["asset-1"])),
      effects: {
        "jump-scare": {
          id: "jump-scare",
          name: "Jump Scare",
          type: "jump-scare",
          assetIds: ["asset-1"],
        },
      },
    });
    const bytes = new Uint8Array([0x00, 0x01, 0x02]);
    const expectedHash = await sha256Hex(bytes);
    const assets = { "asset-1": bytes };
    const res = await validatePack(manifest, { assets });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.manifest.assets["asset-1"].hash).toBe(expectedHash);
    }
  });

  it("rejects a pack signed by an untrusted public key", async () => {
    const { validatePack } = await import("./effect-packs");
    const manifest = await makeMinimalPack();
    const res = await validatePack(manifest, { trustedPublicKeys: ["other-key"] });
    expect(res).toEqual({ ok: false, error: "invalid_signature" });
  });
});

describe("validateEffectSelection", () => {
  it("accepts a declared effect and asset", async () => {
    const { validatePack, validateEffectSelection } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack({}, ["asset-1"])),
      effects: {
        "jump-scare": {
          id: "jump-scare",
          name: "Jump Scare",
          type: "jump-scare",
          assetIds: ["asset-1"],
        },
      },
    });
    const pack = await validatePack(manifest);
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    const selection = validateEffectSelection(pack, { effectId: "jump-scare", assetId: "asset-1" });
    expect(selection).toEqual({ ok: true, effect: expect.objectContaining({ id: "jump-scare" }), asset: expect.objectContaining({ id: "asset-1" }) });
  });

  it("rejects an undeclared effect", async () => {
    const { validatePack, validateEffectSelection } = await import("./effect-packs");
    const manifest = await makeMinimalPack();
    const pack = await validatePack(manifest);
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    const selection = validateEffectSelection(pack, { effectId: "ghost" });
    expect(selection).toEqual({ ok: false, error: "undeclared_effect" });
  });

  it("rejects an undeclared asset for a jump scare", async () => {
    const { validatePack, validateEffectSelection } = await import("./effect-packs");
    const manifest = await signPackWithKey({
      ...(await makeMinimalPack({}, ["asset-1"])),
      effects: {
        "jump-scare": {
          id: "jump-scare",
          name: "Jump Scare",
          type: "jump-scare",
          assetIds: ["asset-1"],
        },
      },
    });
    const pack = await validatePack(manifest);
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    const selection = validateEffectSelection(pack, { effectId: "jump-scare", assetId: "ghost" });
    expect(selection).toEqual({ ok: false, error: "undeclared_asset" });
  });
});
