import type {
  AssetType,
  EffectDefinition,
  EffectType,
  PackManifest,
  ValidatedPack,
} from "./effect-packs";

/**
 * Shared Overlay Renderer.
 *
 * The renderer turns a Live Event into a deterministic, platform-independent
 * render plan. Platforms (Tauri, browser fallback) consume the plan and render
 * the actual pixels. The renderer has no framework or DOM dependencies.
 */

export interface RenderInput {
  donorName: string;
  /** Human-readable amount, already converted from raw units by the caller. */
  amountDisplay: string;
  tokenSymbol: string;
  message?: string | null;
  effect?: { effectId: string } | null;
}

export interface Clock {
  now: () => number;
}

export interface RandomSource {
  /** Return a number in the half-open interval [0, 1). */
  random: () => number;
}

export interface RenderDeps {
  pack?: ValidatedPack;
  clock?: Clock;
  random?: RandomSource;
  /** Duration used for ordinary Donation Alerts. Defaults to 10 seconds. */
  alertDurationMs?: number;
}

export interface DonationAlertPlan {
  type: "donation-alert";
  donorName: string;
  amountDisplay: string;
  tokenSymbol: string;
  message: string | null;
  startedAt: number;
  endsAt: number;
  durationMs: number;
}

export interface JumpScareGeometry {
  type: "jump-scare";
  center: true;
  maxDisplayPct: number;
}

export interface ScreenFlashGeometry {
  type: "screen-flash";
  color: string;
  /** The flash completes exactly one fade cycle. */
  repeat: 1;
}

export interface ScreenCoverGeometry {
  type: "screen-cover";
  obscuredPct: number;
}

export interface TunnelVisionGeometry {
  type: "tunnel-vision";
  visibleDiameterPct: number;
}

export type EffectGeometry =
  | JumpScareGeometry
  | ScreenFlashGeometry
  | ScreenCoverGeometry
  | TunnelVisionGeometry;

export interface EffectMedia {
  assetId: string;
  assetType: AssetType;
  path: string;
  maxDisplayPct: number;
}

export interface EffectAudio {
  assetId: string;
  path: string;
  /** Volume in the range [0, 1]. */
  volume: number;
}

export interface CompactAttribution {
  donorName: string;
  amountDisplay: string;
  tokenSymbol: string;
  effectName: string;
}

export interface EffectPlan {
  type: "effect";
  effectType: EffectType;
  effectName: string;
  attribution: CompactAttribution;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  geometry: EffectGeometry;
  media?: EffectMedia;
  audio?: EffectAudio;
}

export type RenderPlan = DonationAlertPlan | EffectPlan;

export type RenderPlanResult =
  | { ok: true; plan: RenderPlan }
  | { ok: false; error: "undeclared_effect" | "undeclared_asset" };

const DEFAULT_ALERT_DURATION_MS = 10000;

function defaultClock(): Clock {
  return { now: () => Date.now() };
}

function defaultRandom(): RandomSource {
  return { random: () => Math.random() };
}

function selectAsset(effect: EffectDefinition, random: RandomSource): string | null {
  const ids = effect.assetIds;
  if (!ids || ids.length === 0) return null;
  const index = Math.floor(random.random() * ids.length);
  return ids[index];
}

function resolveJumpScareDuration(assetType: AssetType): number {
  return assetType === "gif" ? 4000 : 2000;
}

function buildAlertPlan(input: RenderInput, startedAt: number, durationMs: number): DonationAlertPlan {
  return {
    type: "donation-alert",
    donorName: input.donorName,
    amountDisplay: input.amountDisplay,
    tokenSymbol: input.tokenSymbol,
    message: input.message ?? null,
    startedAt,
    durationMs,
    endsAt: startedAt + durationMs,
  };
}

function buildEffectPlan(
  input: RenderInput,
  effect: EffectDefinition,
  manifest: PackManifest,
  startedAt: number,
  random: RandomSource,
): RenderPlanResult {
  const attribution: CompactAttribution = {
    donorName: input.donorName,
    amountDisplay: input.amountDisplay,
    tokenSymbol: input.tokenSymbol,
    effectName: effect.name,
  };

  if (effect.type === "jump-scare") {
    const assetId = selectAsset(effect, random);
    if (!assetId) return { ok: false, error: "undeclared_asset" };
    const asset = manifest.assets[assetId];
    if (!asset) return { ok: false, error: "undeclared_asset" };

    const durationMs = resolveJumpScareDuration(asset.type);
    const maxDisplayPct = effect.maxDisplayPct ?? 80;

    let audio: EffectAudio | undefined;
    if (effect.audioId) {
      const audioAsset = manifest.assets[effect.audioId];
      if (!audioAsset) return { ok: false, error: "undeclared_asset" };
      audio = { assetId: audioAsset.id, path: audioAsset.path, volume: 0.7 };
    }

    return {
      ok: true,
      plan: {
        type: "effect",
        effectType: "jump-scare",
        effectName: effect.name,
        attribution,
        startedAt,
        durationMs,
        endsAt: startedAt + durationMs,
        geometry: { type: "jump-scare", center: true, maxDisplayPct },
        media: {
          assetId: asset.id,
          assetType: asset.type,
          path: asset.path,
          maxDisplayPct,
        },
        audio,
      },
    };
  }

  if (effect.type === "screen-flash") {
    const durationMs = effect.durationMs ?? 1000;
    return {
      ok: true,
      plan: {
        type: "effect",
        effectType: "screen-flash",
        effectName: effect.name,
        attribution,
        startedAt,
        durationMs,
        endsAt: startedAt + durationMs,
        geometry: { type: "screen-flash", color: "#ffffff", repeat: 1 },
      },
    };
  }

  if (effect.type === "screen-cover") {
    const durationMs = effect.durationMs ?? 3000;
    return {
      ok: true,
      plan: {
        type: "effect",
        effectType: "screen-cover",
        effectName: effect.name,
        attribution,
        startedAt,
        durationMs,
        endsAt: startedAt + durationMs,
        geometry: { type: "screen-cover", obscuredPct: effect.obscuredPct ?? 70 },
      },
    };
  }

  if (effect.type === "tunnel-vision") {
    const durationMs = effect.durationMs ?? 5000;
    return {
      ok: true,
      plan: {
        type: "effect",
        effectType: "tunnel-vision",
        effectName: effect.name,
        attribution,
        startedAt,
        durationMs,
        endsAt: startedAt + durationMs,
        geometry: {
          type: "tunnel-vision",
          visibleDiameterPct: effect.visibleDiameterPct ?? 35,
        },
      },
    };
  }

  // Exhaustiveness: effectType is narrowed by the EffectType union.
  return { ok: false, error: "undeclared_effect" };
}

/**
 * Plan a render for the given Live Event input. The returned plan contains
 * timing, geometry, attribution, and asset references derived only from the
 * validated Default Pack manifest.
 */
export function planRender(input: RenderInput, deps: RenderDeps): RenderPlanResult {
  const clock = deps.clock ?? defaultClock();
  const random = deps.random ?? defaultRandom();
  const startedAt = clock.now();

  if (!input.effect) {
    const durationMs = deps.alertDurationMs ?? DEFAULT_ALERT_DURATION_MS;
    return { ok: true, plan: buildAlertPlan(input, startedAt, durationMs) };
  }

  if (!deps.pack) {
    return { ok: false, error: "undeclared_effect" };
  }

  const effect = deps.pack.manifest.effects[input.effect.effectId];
  if (!effect) {
    return { ok: false, error: "undeclared_effect" };
  }

  return buildEffectPlan(input, effect, deps.pack.manifest, startedAt, random);
}
