/// <reference lib="dom" />
import { z } from "zod";

/**
 * Shared Effect Packs contract.
 *
 * Effect Packs are first-party, signed, declarative collections of Donation
 * Effects. The contract validates pack structure, hashes, signatures, asset
 * references, and content policy. It rejects remote asset URLs and executable
 * pack content. Runtime input may select only identifiers declared in the
 * validated manifest.
 */

export const assetTypeSchema = z.enum(["image", "gif", "audio"]);
export const effectTypeSchema = z.enum([
  "jump-scare",
  "screen-flash",
  "screen-cover",
  "tunnel-vision",
]);

export type AssetType = z.infer<typeof assetTypeSchema>;
export type EffectType = z.infer<typeof effectTypeSchema>;

export const assetDefinitionSchema = z
  .object({
    id: z.string().min(1),
    type: assetTypeSchema,
    path: z.string().min(1),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    contentType: z.string().min(1),
  })
  .strict();

export const effectDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: effectTypeSchema,
    durationMs: z.number().int().nonnegative().optional(),
    assetIds: z.array(z.string().min(1)).optional(),
    audioId: z.string().min(1).optional(),
    maxDisplayPct: z.number().int().min(0).max(100).optional(),
    obscuredPct: z.number().int().min(0).max(100).optional(),
    visibleDiameterPct: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const manifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    effects: z.record(z.string().min(1), effectDefinitionSchema),
    assets: z.record(z.string().min(1), assetDefinitionSchema),
    manifestHash: z.string().regex(/^[0-9a-f]{64}$/),
    signature: z.string().min(1),
    publicKey: z.string().min(1),
  })
  .strict();

export type AssetDefinition = z.infer<typeof assetDefinitionSchema>;
export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;
export type PackManifest = z.infer<typeof manifestSchema>;

export interface ValidatedPack {
  manifest: PackManifest;
  effectIds: string[];
  assetIds: string[];
}

export type PackValidationError =
  | "invalid_manifest"
  | "invalid_signature"
  | "invalid_hash"
  | "invalid_version"
  | "remote_asset_url"
  | "executable_pack_content"
  | "undeclared_effect"
  | "undeclared_asset";

export type PackValidationResult =
  | { ok: true; manifest: PackManifest; effectIds: string[]; assetIds: string[] }
  | { ok: false; error: PackValidationError };

const SEMVER_LIKE = /^\d+\.\d+\.\d+$/;

const FORBIDDEN_EFFECT_KEYS = new Set([
  "script",
  "code",
  "eval",
  "wasm",
  "native",
  "exec",
  "binary",
  "program",
]);

const EXECUTABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".wasm",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".bin",
  ".o",
  ".a",
  ".py",
  ".rb",
  ".pl",
  ".php",
  ".java",
  ".class",
  ".jar",
  ".swift",
]);

const EXECUTABLE_CONTENT_TYPES = [
  "application/javascript",
  "text/javascript",
  "application/wasm",
  "application/x-executable",
  "application/x-mach-binary",
  "application/x-ms-dos-executable",
  "application/vnd.microsoft.portable-executable",
];

const REMOTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const NETWORK_PATH_RE = /^\/\//;

function getSubtleCrypto(): SubtleCrypto {
  const global = globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } };
  const subtle = global.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available");
  }
  return subtle;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

function hasExecutableContent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasExecutableContent);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;

  if (typeof record.path === "string" || typeof record.contentType === "string") {
    const path = String(record.path ?? "");
    const contentType = String(record.contentType ?? "").toLowerCase();
    const extIndex = path.lastIndexOf(".");
    const ext = extIndex === -1 ? "" : path.slice(extIndex).toLowerCase();
    if (EXECUTABLE_EXTENSIONS.has(ext)) return true;
    for (const ct of EXECUTABLE_CONTENT_TYPES) {
      if (contentType === ct || contentType.startsWith(ct + ";")) return true;
    }
  }

  for (const [key, val] of Object.entries(record)) {
    if (typeof key === "string" && FORBIDDEN_EFFECT_KEYS.has(key)) return true;
    if (hasExecutableContent(val)) return true;
  }

  return false;
}

function hasRemoteAssetUrl(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasRemoteAssetUrl);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string") {
    const path = record.path;
    if (REMOTE_URL_RE.test(path) || NETWORK_PATH_RE.test(path)) return true;
  }
  for (const val of Object.values(record)) {
    if (hasRemoteAssetUrl(val)) return true;
  }
  return false;
}

function hasUndeclaredEffectAssets(manifest: PackManifest): boolean {
  for (const effect of Object.values(manifest.effects)) {
    if (effect.assetIds) {
      for (const assetId of effect.assetIds) {
        if (!manifest.assets[assetId]) return true;
      }
    }
    if (effect.audioId && !manifest.assets[effect.audioId]) return true;
  }
  return false;
}

function hasInvalidEffectShapes(manifest: PackManifest): boolean {
  for (const effect of Object.values(manifest.effects)) {
    if (effect.type === "jump-scare") {
      if (!effect.assetIds || effect.assetIds.length === 0) return true;
      continue;
    }
    if (effect.durationMs === undefined || effect.durationMs === null) return true;
  }
  return false;
}

function canonicalizeForSort(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeForSort);
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = canonicalizeForSort((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Return a deterministic, compact JSON representation of a value. Object keys
 * are sorted recursively so the same logical manifest always produces the same
 * canonical string regardless of insertion order.
 */
export function canonicalizeForHash(value: unknown): string {
  return JSON.stringify(canonicalizeForSort(value));
}

/**
 * Compute the SHA-256 hex digest of a string or byte array using the Web
 * Crypto API. This works in Node.js and browsers without importing platform
 * crypto modules.
 */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const subtle = getSubtleCrypto();
  const buffer = await subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyManifestSignature(manifest: PackManifest, payload: string): Promise<boolean> {
  try {
    const subtle = getSubtleCrypto();
    const publicKeyBytes = base64ToBytes(manifest.publicKey);
    const signatureBytes = base64ToBytes(manifest.signature);
    const publicKey = await subtle.importKey(
      "spki",
      publicKeyBytes.buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
    const payloadBytes = new TextEncoder().encode(payload);
    return await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signatureBytes.buffer as ArrayBuffer,
      payloadBytes.buffer as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

export interface ValidatePackDeps {
  assets?: Record<string, Uint8Array>;
  trustedPublicKeys?: string[];
}

/**
 * Validate a pack manifest. The contract rejects invalid structure, versions,
 * remote asset URLs, executable content, undeclared effect assets, mismatched
 * hashes, and invalid signatures. When `deps.assets` is supplied, each asset
 * hash is verified against the provided bytes.
 */
export async function validatePack(
  manifest: unknown,
  deps: ValidatePackDeps = {},
): Promise<PackValidationResult> {
  if (hasExecutableContent(manifest)) {
    return { ok: false, error: "executable_pack_content" };
  }

  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    return { ok: false, error: "invalid_manifest" };
  }

  const m = parsed.data;

  if (hasRemoteAssetUrl(m)) {
    return { ok: false, error: "remote_asset_url" };
  }

  if (hasUndeclaredEffectAssets(m)) {
    return { ok: false, error: "undeclared_asset" };
  }

  if (hasInvalidEffectShapes(m)) {
    return { ok: false, error: "invalid_manifest" };
  }

  if (!SEMVER_LIKE.test(m.version)) {
    return { ok: false, error: "invalid_version" };
  }

  const payload = canonicalizeForHash({
    id: m.id,
    version: m.version,
    effects: m.effects,
    assets: m.assets,
    publicKey: m.publicKey,
  });

  const manifestHash = await sha256Hex(payload);
  if (manifestHash !== m.manifestHash) {
    return { ok: false, error: "invalid_hash" };
  }

  const signatureValid = await verifyManifestSignature(m, payload);
  if (!signatureValid) {
    return { ok: false, error: "invalid_signature" };
  }

  if (deps.trustedPublicKeys && !deps.trustedPublicKeys.includes(m.publicKey)) {
    return { ok: false, error: "invalid_signature" };
  }

  if (deps.assets) {
    for (const [id, asset] of Object.entries(m.assets)) {
      const bytes = deps.assets[id];
      if (!bytes) continue;
      const assetHash = await sha256Hex(bytes);
      if (assetHash !== asset.hash) {
        return { ok: false, error: "invalid_hash" };
      }
    }
  }

  return {
    ok: true,
    manifest: m,
    effectIds: Object.keys(m.effects),
    assetIds: Object.keys(m.assets),
  };
}

export type EffectSelectionResult =
  | { ok: true; effect: EffectDefinition; asset?: AssetDefinition }
  | { ok: false; error: "undeclared_effect" | "undeclared_asset" };

/**
 * Validate that a runtime effect selection references only identifiers declared
 * in the validated manifest. An optional `assetId` may be checked for effects
 * that select a specific bundled asset.
 */
export function validateEffectSelection(
  pack: ValidatedPack,
  input: { effectId: string; assetId?: string },
): EffectSelectionResult {
  const effect = pack.manifest.effects[input.effectId];
  if (!effect) {
    return { ok: false, error: "undeclared_effect" };
  }

  if (input.assetId) {
    const asset = pack.manifest.assets[input.assetId];
    if (!asset) {
      return { ok: false, error: "undeclared_asset" };
    }
    if (effect.type === "jump-scare" && effect.assetIds && !effect.assetIds.includes(input.assetId)) {
      return { ok: false, error: "undeclared_asset" };
    }
    return { ok: true, effect, asset };
  }

  return { ok: true, effect };
}
