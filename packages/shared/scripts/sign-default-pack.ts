/// <reference lib="dom" />
import { writeFileSync } from "node:fs";
import { canonicalizeForHash, sha256Hex } from "../src/overlay/effect-packs.ts";

/**
 * Build the bundled Default Pack manifest and its embedded asset hashes, then
 * sign the manifest with a fresh ECDSA P-256 key pair. The public key and
 * signature are embedded in the generated `default-pack.ts` so the pack is
 * self-validating at runtime. The private key is not written to disk.
 */

const PNG_BLACK =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip18AAAAASUVORK5CYII=";
const PNG_TRANSPARENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const GIF_TRANSPARENT =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

interface AssetInput {
  type: "image" | "gif" | "audio";
  path: string;
  contentType: string;
  base64?: string;
  bytes?: Uint8Array;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function makeSilenceWav(): Uint8Array {
  const sampleCount = 1;
  const dataSize = sampleCount;
  const chunkSize = 36 + dataSize;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  };
  const writeUint32 = (v: number) => {
    view.setUint32(offset, v, true);
    offset += 4;
  };
  const writeUint16 = (v: number) => {
    view.setUint16(offset, v, true);
    offset += 2;
  };

  writeString("RIFF");
  writeUint32(chunkSize);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(1);
  writeUint32(44100);
  writeUint32(44100);
  writeUint16(1);
  writeUint16(8);
  writeString("data");
  writeUint32(dataSize);
  view.setUint8(offset, 0x80);

  return new Uint8Array(buffer);
}

async function main() {
  const assetsInput: Record<string, AssetInput> = {
    "jump-scare-1": {
      type: "image",
      path: "default-pack/jump-scare/1.png",
      contentType: "image/png",
      base64: PNG_BLACK,
    },
    "jump-scare-2": {
      type: "gif",
      path: "default-pack/jump-scare/2.gif",
      contentType: "image/gif",
      base64: GIF_TRANSPARENT,
    },
    "jump-scare-3": {
      type: "image",
      path: "default-pack/jump-scare/3.png",
      contentType: "image/png",
      base64: PNG_TRANSPARENT,
    },
    "jump-scare-audio": {
      type: "audio",
      path: "default-pack/jump-scare/audio.wav",
      contentType: "audio/wav",
      bytes: makeSilenceWav(),
    },
  };

  const assetRecords: Record<string, unknown> = {};
  const assetBytesById: Record<string, Uint8Array> = {};
  const assetBase64ById: Record<string, string> = {};

  for (const [id, data] of Object.entries(assetsInput)) {
    const bytes = data.base64 ? base64ToBytes(data.base64) : data.bytes!;
    const hash = await sha256Hex(bytes);
    assetRecords[id] = {
      id,
      type: data.type,
      path: data.path,
      hash,
      contentType: data.contentType,
    };
    assetBytesById[id] = bytes;
    assetBase64ById[id] = btoa(String.fromCharCode(...bytes));
  }

  const effects = {
    "jump-scare": {
      id: "jump-scare",
      name: "Jump Scare",
      type: "jump-scare",
      assetIds: ["jump-scare-1", "jump-scare-2", "jump-scare-3"],
      audioId: "jump-scare-audio",
      maxDisplayPct: 80,
    },
    "screen-flash": {
      id: "screen-flash",
      name: "Screen Flash",
      type: "screen-flash",
      durationMs: 1000,
    },
    "screen-cover": {
      id: "screen-cover",
      name: "Screen Cover",
      type: "screen-cover",
      durationMs: 3000,
      obscuredPct: 70,
    },
    "tunnel-vision": {
      id: "tunnel-vision",
      name: "Tunnel Vision",
      type: "tunnel-vision",
      durationMs: 5000,
      visibleDiameterPct: 35,
    },
  };

  const id = "startip.default";
  const version = "1.0.0";

  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = await globalThis.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(spki)));

  const payload = canonicalizeForHash({ id, version, effects, assets: assetRecords, publicKey });
  const manifestHash = await sha256Hex(payload);

  const signatureBuffer = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payload),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  const manifest = {
    id,
    version,
    effects,
    assets: assetRecords,
    publicKey,
    manifestHash,
    signature,
  };

  const assetEntries = Object.keys(assetBase64ById)
    .map((id) => `  ${JSON.stringify(id)}: base64ToBytes(ASSET_BASE64[${JSON.stringify(id)}]),`)
    .join("\n");

  const fileContent = `/// <reference lib="dom" />
// Auto-generated by scripts/sign-default-pack.ts. Do not edit manually.
import type { PackManifest } from "./effect-packs";

const ASSET_BASE64: Record<string, string> = ${JSON.stringify(assetBase64ById, null, 2)};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export const defaultPackAssets: Record<string, Uint8Array> = {
${assetEntries}
};

export const defaultPackManifest = ${JSON.stringify(manifest, null, 2)} as unknown as PackManifest;
`;

  writeFileSync(new URL("../src/overlay/default-pack.ts", import.meta.url), fileContent);
  console.log("Generated packages/shared/src/overlay/default-pack.ts");
  console.log("Public key:", publicKey);
  console.log("Manifest hash:", manifestHash);
  console.log("Signature:", signature);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
