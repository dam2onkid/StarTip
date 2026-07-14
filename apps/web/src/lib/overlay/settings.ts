/**
 * Pure, client-safe Overlay settings helpers.
 *
 * The Overlay server component (`app/(public)/overlay/[overlay_id]/page.tsx`)
 * loads the Creator's `overlay_settings` row (or falls back to the column
 * defaults when no row exists), resolves `min_amount` from display units to
 * raw units (multiplied by 10^decimals for the donation's token), and passes
 * the resolved settings to the `<OverlayAlerts>` client component. The client
 * applies {@link shouldShowAlert} to suppress donations below `min_amount`
 * and {@link alertDurationMs} to auto-dismiss each alert after the configured
 * duration.
 *
 * The module has no `server-only` marker and imports nothing, so it is safe
 * to import from client components, server components, and tests alike.
 */

import { displayToRawAmount, rawToDisplayAmount } from "@/lib/stellar/amount";

/** The default alert duration (ms) when no row exists or the field is missing. */
export const DEFAULT_ALERT_DURATION_MS = 10000;

/** Minimum/maximum allowed `alert_duration_ms` (matches the API validation). */
export const MIN_ALERT_DURATION_MS = 1000;
export const MAX_ALERT_DURATION_MS = 60000;

/**
 * Token entry for the Overlay allowlist. The server passes the token's
 * `decimals` so `min_amount` can be converted to raw units once.
 */
export interface OverlayToken {
  contract_address: string;
  symbol: string;
  /** Token decimals (used by the server to convert min_amount to raw units). */
  decimals?: number;
}

/**
 * Resolved Overlay settings as seen by the client. The server component
 * converts `min_amount` from display units to raw units before building this
 * object, so the client compares raw `amount` (i128) against raw
 * `minAmountRaw` without a per-alert decimals lookup.
 */
export interface OverlaySettings {
  /** Alert duration in ms, or `undefined` when the row used the column default. */
  alertDurationMs?: number;
  /** `min_amount` in raw units (a numeric string, i128-scale), or `undefined` for 0. */
  minAmountRaw?: string;
  /** Whether a sound plays on Realtime insert. Defaults to `true`. */
  soundEnabled?: boolean;
  /** Whether Alert Reading (Text-to-Speech) is enabled. Defaults to `false`. */
  ttsEnabled?: boolean;
  /** The selected TTS voice identifier, or `null` when no voice is chosen. */
  ttsVoice?: string | null;
}

/** A donation with the fields the filter needs (raw `amount` as a numeric string). */
export interface OverlayDonationFilter {
  amount: string;
}

/**
 * Resolve the raw `overlay_settings` row (or null) into the client-facing
 * `OverlaySettings` shape. `min_amount` is converted from display units to
 * raw units (multiplied by 10^decimals) using the first token in the
 * allowlist (the MVP is single-token). When no row exists, the defaults
 * (10000ms, no threshold, sound on, TTS off) apply.
 */
export function resolveOverlaySettings(
  row: {
    alert_duration_ms: number | null;
    min_amount: string | number | null;
    sound_enabled: boolean | null;
    tts_enabled: boolean | null;
    tts_voice: string | null;
  } | null,
  tokenAllowlist: OverlayToken[],
): OverlaySettings {
  const settings: OverlaySettings = {};
  if (!row) return settings;

  if (row.alert_duration_ms !== null) {
    settings.alertDurationMs = row.alert_duration_ms;
  }
  if (row.sound_enabled !== null) {
    settings.soundEnabled = row.sound_enabled;
  }
  if (row.tts_enabled !== null) {
    settings.ttsEnabled = row.tts_enabled;
  }
  settings.ttsVoice = row.tts_voice;
  if (row.min_amount !== null) {
    const decimals = tokenAllowlist[0]?.decimals ?? 0;
    settings.minAmountRaw = displayToRawAmount(String(row.min_amount), decimals);
  }

  return settings;
}

/**
 * Whether a donation should appear on the Overlay. Returns `false` when the
 * donation's raw `amount` is strictly less than the Creator's `min_amount`
 * (in raw units). The boundary is inclusive: a donation equal to `min_amount`
 * is shown. A missing `minAmountRaw` is treated as `0` (no threshold).
 *
 * Non-numeric `amount` values are shown (defensive: never silently suppress a
 * real alert because of a malformed row).
 */
export function shouldShowAlert(
  donation: OverlayDonationFilter,
  settings: OverlaySettings,
): boolean {
  const minRaw = settings.minAmountRaw ?? "0";
  let amount: bigint;
  let min: bigint;
  try {
    amount = BigInt(donation.amount);
    min = BigInt(minRaw);
  } catch {
    return true;
  }
  return amount >= min;
}

/**
 * The configured alert duration in ms, clamped to the 1000-60000 band, with
 * the 10000ms default when the field is missing or not a finite number. The
 * clamp mirrors the API validation so a stale/invalid row never produces an
 * unworkable timer (e.g. 0ms or 99999ms).
 */
export function alertDurationMs(settings: OverlaySettings): number {
  const raw = settings.alertDurationMs;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_ALERT_DURATION_MS;
  }
  if (raw < MIN_ALERT_DURATION_MS) return MIN_ALERT_DURATION_MS;
  if (raw > MAX_ALERT_DURATION_MS) return MAX_ALERT_DURATION_MS;
  return raw;
}

/** Maximum length of the message portion of an Alert Reading text. */
export const TTS_READING_MESSAGE_MAX_LENGTH = 200;

/** Input to {@link buildReadingText}. */
export interface BuildReadingTextInput {
  /** Raw donor name as stored on the donation. */
  donorName: string;
  /** Raw amount (i128 string) in the smallest divisible unit. */
  amount: string;
  /** Token symbol (already resolved by the Overlay). */
  symbol: string;
  /** Token decimals used to convert the raw amount to display units. */
  decimals: number;
  /** Donation message; null or empty means no message is read. */
  message: string | null;
  /** The selected Voice identifier, e.g. `en-US-EmmaNeural`. */
  voice: string;
}

type ReadingTemplate = (
  donorName: string,
  amount: string,
  symbol: string,
  message: string | null,
) => string;

function englishTemplate(
  donorName: string,
  amount: string,
  symbol: string,
  message: string | null,
): string {
  const base = `${donorName} donated ${amount} ${symbol}`;
  return message ? `${base}. ${message}` : `${base}.`;
}

const TTS_READING_TEMPLATES: Record<string, ReadingTemplate> = {
  "en-US": englishTemplate,
  "en-GB": englishTemplate,
  "vi-VN": (donorName, amount, symbol, message) => {
    const base = `${donorName} đã quyên góp ${amount} ${symbol}`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "fr-FR": (donorName, amount, symbol, message) => {
    const base = `${donorName} a donné ${amount} ${symbol}`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "es-ES": (donorName, amount, symbol, message) => {
    const base = `${donorName} donó ${amount} ${symbol}`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "de-DE": (donorName, amount, symbol, message) => {
    const base = `${donorName} spendete ${amount} ${symbol}`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "it-IT": (donorName, amount, symbol, message) => {
    const base = `${donorName} ha donato ${amount} ${symbol}`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "ja-JP": (donorName, amount, symbol, message) => {
    const base = `${donorName}が ${amount} ${symbol} を寄付しました`;
    return message ? `${base}。${message}` : `${base}。`;
  },
  "ko-KR": (donorName, amount, symbol, message) => {
    const base = `${donorName} 님이 ${amount} ${symbol}을 기부했습니다`;
    return message ? `${base}. ${message}` : `${base}.`;
  },
  "zh-CN": (donorName, amount, symbol, message) => {
    const base = `${donorName} 捐赠了 ${amount} ${symbol}`;
    return message ? `${base}。${message}` : `${base}。`;
  },
};

function truncateReadingMessage(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace <= 0) return slice;
  return slice.slice(0, lastSpace);
}

/**
 * Extract the BCP-47 style locale from an edge-tts style Voice identifier.
 * Voice identifiers have the form `<locale>-<voice>` (e.g.
 * `en-US-EmmaNeural`), so the locale is the first two hyphen-separated
 * components. If the identifier is malformed, falls back to `en-US`.
 */
export function voiceLocale(voice: string): string {
  const parts = voice.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return "en-US";
}

/**
 * Build the Alert Reading text for a Donation Alert in the Voice's locale.
 * The amount is converted to display units using the token decimals, and the
 * message portion is capped to roughly {@link TTS_READING_MESSAGE_MAX_LENGTH}
 * characters before being sent to the Text-to-Speech Provider. The visible
 * Donation Alert message is never modified by this helper.
 */
export function buildReadingText(input: BuildReadingTextInput): string {
  const displayAmount = rawToDisplayAmount(input.amount, input.decimals);
  const template =
    TTS_READING_TEMPLATES[voiceLocale(input.voice)] ?? TTS_READING_TEMPLATES["en-US"];
  const rawMessage = input.message?.trim() ?? "";
  const message = rawMessage
    ? truncateReadingMessage(rawMessage, TTS_READING_MESSAGE_MAX_LENGTH)
    : null;
  return template(input.donorName, displayAmount, input.symbol, message);
}
