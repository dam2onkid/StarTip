// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * lib/overlay/settings - pure, client-safe helpers for the Overlay.
 *
 * `shouldShowAlert` suppresses donations whose raw `amount` is below the
 * Creator's `min_amount` (already converted to raw units by the server
 * component, so the client never needs a per-alert decimals lookup).
 * `alertDurationMs` returns the configured alert duration or the 10000ms
 * default when the field is missing/invalid.
 */

describe("shouldShowAlert", () => {
  it("returns true when amount equals min_amount (boundary is inclusive)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "1000" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(true);
  });

  it("returns true when amount is above min_amount", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "5000" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(true);
  });

  it("returns false when amount is below min_amount (raw units)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "999" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(false);
  });

  it("returns true when min_amount is 0 (no threshold)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert({ amount: "1" }, { minAmountRaw: "0" }),
    ).toBe(true);
  });

  it("treats a missing minAmountRaw as 0 (no threshold)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(shouldShowAlert({ amount: "1" }, {})).toBe(true);
  });

  it("handles arbitrary-precision i128 amounts via BigInt", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    const big = "9".repeat(40); // exceeds Number.MAX_SAFE_INTEGER
    expect(
      shouldShowAlert(
        { amount: big },
        { minAmountRaw: "1" + "0".repeat(40) },
      ),
    ).toBe(false);
    expect(
      shouldShowAlert(
        { amount: "2" + "0".repeat(40) },
        { minAmountRaw: "1" + "0".repeat(40) },
      ),
    ).toBe(true);
  });

  it("returns true when amount is non-numeric (defensive: never suppress a real alert)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert({ amount: "not-a-number" }, { minAmountRaw: "0" }),
    ).toBe(true);
  });
});

describe("resolveOverlaySettings", () => {
  const tokenAllowlist = [
    { contract_address: "XLM_CONTRACT", symbol: "XLM", decimals: 7 },
  ];

  it("returns an empty settings object when no row exists", async () => {
    const { resolveOverlaySettings } = await import("@/lib/overlay/settings");
    expect(resolveOverlaySettings(null, tokenAllowlist)).toEqual({});
  });

  it("copies alert_duration_ms, sound_enabled, and tts fields into the client shape", async () => {
    const { resolveOverlaySettings } = await import("@/lib/overlay/settings");
    const resolved = resolveOverlaySettings(
      {
        alert_duration_ms: 5000,
        min_amount: null,
        sound_enabled: true,
        tts_enabled: true,
        tts_voice: "en-US-EmmaNeural",
      },
      tokenAllowlist,
    );
    expect(resolved).toMatchObject({
      alertDurationMs: 5000,
      soundEnabled: true,
      ttsEnabled: true,
      ttsVoice: "en-US-EmmaNeural",
    });
  });

  it("converts min_amount from display to raw units using the first token's decimals", async () => {
    const { resolveOverlaySettings } = await import("@/lib/overlay/settings");
    const resolved = resolveOverlaySettings(
      {
        alert_duration_ms: null,
        min_amount: "9",
        sound_enabled: null,
        tts_enabled: null,
        tts_voice: null,
      },
      tokenAllowlist,
    );
    expect(resolved.minAmountRaw).toBe("90000000");
  });

  it("uses 0 decimals and falls back to 0 when no token allowlist is available", async () => {
    const { resolveOverlaySettings } = await import("@/lib/overlay/settings");
    const resolved = resolveOverlaySettings(
      {
        alert_duration_ms: null,
        min_amount: "5",
        sound_enabled: null,
        tts_enabled: null,
        tts_voice: null,
      },
      [],
    );
    expect(resolved.minAmountRaw).toBe("5");
  });

  it("returns tts_voice as null when the row stores null", async () => {
    const { resolveOverlaySettings } = await import("@/lib/overlay/settings");
    const resolved = resolveOverlaySettings(
      {
        alert_duration_ms: null,
        min_amount: null,
        sound_enabled: null,
        tts_enabled: true,
        tts_voice: null,
      },
      [],
    );
    expect(resolved.ttsEnabled).toBe(true);
    expect(resolved.ttsVoice).toBeNull();
  });
});

describe("alertDurationMs", () => {
  it("returns the configured duration when set", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 4000 })).toBe(4000);
  });

  it("returns the 10000 default when the field is missing", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({})).toBe(10000);
  });

  it("returns the 10000 default when the field is not a finite number", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: NaN })).toBe(10000);
    expect(alertDurationMs({ alertDurationMs: Infinity })).toBe(10000);
    expect(alertDurationMs({ alertDurationMs: "10000" as unknown as number })).toBe(10000);
  });

  it("clamps a sub-1000 value up to the 1000 floor", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 500 })).toBe(1000);
  });

  it("clamps a super-60000 value down to the 60000 ceiling", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 99999 })).toBe(60000);
  });
});

describe("voiceLocale", () => {
  it("extracts the locale from an edge-tts style voice identifier", async () => {
    const { voiceLocale } = await import("@/lib/overlay/settings");
    expect(voiceLocale("en-US-EmmaNeural")).toBe("en-US");
    expect(voiceLocale("vi-VN-HoaiMyNeural")).toBe("vi-VN");
  });

  it("falls back to en-US when the voice identifier has no locale", async () => {
    const { voiceLocale } = await import("@/lib/overlay/settings");
    expect(voiceLocale("EmmaNeural")).toBe("en-US");
  });
});

describe("buildReadingText", () => {
  it("builds an English Alert Reading from donor, display amount, symbol, and message", async () => {
    const { buildReadingText } = await import("@/lib/overlay/settings");
    const text = buildReadingText({
      donorName: "Ada",
      amount: "90000000",
      symbol: "XLM",
      decimals: 7,
      message: "Go team!",
      voice: "en-US-EmmaNeural",
    });
    expect(text).toBe("Ada donated 9 XLM. Go team!");
  });

  it("omits the message when null", async () => {
    const { buildReadingText } = await import("@/lib/overlay/settings");
    const text = buildReadingText({
      donorName: "Bob",
      amount: "1500000",
      symbol: "USDC",
      decimals: 6,
      message: null,
      voice: "en-US-EmmaNeural",
    });
    expect(text).toBe("Bob donated 1.5 USDC.");
  });

  it("uses a Vietnamese template for a Vietnamese voice locale", async () => {
    const { buildReadingText } = await import("@/lib/overlay/settings");
    const text = buildReadingText({
      donorName: "Lan",
      amount: "100",
      symbol: "VND",
      decimals: 0,
      message: "Cố lên!",
      voice: "vi-VN-HoaiMyNeural",
    });
    expect(text).toBe("Lan đã quyên góp 100 VND. Cố lên!");
  });

  it("falls back to English for an unknown voice locale", async () => {
    const { buildReadingText } = await import("@/lib/overlay/settings");
    const text = buildReadingText({
      donorName: "Ada",
      amount: "100",
      symbol: "XLM",
      decimals: 0,
      message: "Hi",
      voice: "xx-XX-UnknownNeural",
    });
    expect(text).toBe("Ada donated 100 XLM. Hi");
  });

  it("caps the message portion to the first ~200 characters", async () => {
    const { buildReadingText, TTS_READING_MESSAGE_MAX_LENGTH } = await import(
      "@/lib/overlay/settings"
    );
    const longMessage = "a".repeat(TTS_READING_MESSAGE_MAX_LENGTH + 40);
    const text = buildReadingText({
      donorName: "Ada",
      amount: "100",
      symbol: "XLM",
      decimals: 0,
      message: longMessage,
      voice: "en-US-EmmaNeural",
    });
    const prefix = "Ada donated 100 XLM. ";
    const messagePortion = text.slice(prefix.length);
    expect(messagePortion.length).toBeLessThanOrEqual(TTS_READING_MESSAGE_MAX_LENGTH);
    expect(longMessage.startsWith(messagePortion)).toBe(true);
  });
});
