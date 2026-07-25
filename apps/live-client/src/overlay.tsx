import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createClient } from "@supabase/supabase-js";
import { planRender, type RenderPlan } from "@startip/shared/overlay/renderer";
import {
  defaultPackAssets,
  defaultPackManifest,
} from "@startip/shared/overlay/default-pack";
import { validatePack, type ValidatedPack } from "@startip/shared/overlay/effect-packs";
import {
  displayToRawAmount,
  isAtLeastRaw,
  rawToDisplayAmount,
} from "@startip/shared/stellar/amount";
import {
  LiveEventClient,
  createSupabaseChannelFactory,
  type ClientConnectionStatus,
  type LiveEventQueueItem,
} from "@startip/shared/live-events/client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const alertSoundUrl = (import.meta.env.VITE_ALERT_SOUND_URL as string | undefined)
  ?? `${apiBaseUrl ?? ""}/alert.mp3`;

const DEFAULT_ALERT_DURATION_MS = 10_000;
const MIN_ALERT_DURATION_MS = 1_000;
const MAX_ALERT_DURATION_MS = 60_000;
const TEST_ALERT_DONATION_ID = "__test__";

interface OverlaySettingsRow {
  alert_duration_ms: number;
  min_amount: number;
  sound_enabled: boolean;
  tts_enabled: boolean;
  tts_voice: string | null;
}

type TtsMode =
  | { type: "donation"; donationId: string }
  | { type: "overlay"; overlayId: string; text: string; voice: string };

function clampAlertDuration(ms: number) {
  return Math.min(Math.max(ms, MIN_ALERT_DURATION_MS), MAX_ALERT_DURATION_MS);
}

function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio is best-effort; silence failures so the visual alert is never blocked.
  }
}

function playAlertSound(enabled: boolean) {
  if (!enabled) return;
  if (!alertSoundUrl) {
    playBeep();
    return;
  }
  const audio = new Audio(alertSoundUrl);
  audio.play().catch(() => {
    playBeep();
  });
}

function packAssetUrl(pack: ValidatedPack, assetId: string): string | null {
  const bytes = defaultPackAssets[assetId];
  const asset = pack.manifest.assets[assetId];
  if (!bytes || !asset) return null;
  const blob = new Blob([bytes], { type: asset.contentType });
  return URL.createObjectURL(blob);
}

function sendAck(overlayId: string, eventId: string, status: string) {
  if (!apiBaseUrl) return;
  void fetch(`${apiBaseUrl}/api/live-events/${eventId}/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overlay_id: overlayId, status }),
    keepalive: true,
  });
}

export function GameOverlay() {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [pack, setPack] = useState<ValidatedPack | null>(null);
  const [plan, setPlan] = useState<RenderPlan | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<LiveEventQueueItem | null>(null);

  const clientRef = useRef<LiveEventClient | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertStartedAtRef = useRef<number | null>(null);
  const settingsRef = useRef<OverlaySettingsRow | null>(null);
  const packRef = useRef<ValidatedPack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    invoke<string | null>("get_overlay_id")
      .then((id) => {
        if (!cancelled) setOverlayId(id);
      })
      .catch(() => {
        // The overlay cannot function without an Overlay ID; stay empty.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    validatePack(defaultPackManifest, { assets: defaultPackAssets })
      .then((res) => {
        if (!cancelled && res.ok) {
          setPack(res);
          packRef.current = res;
        }
      })
      .catch(() => {
        // The bundled pack must validate; if it does not, effect events fail safe.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!overlayId || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    void supabase
      .from("overlay_settings")
      .select("alert_duration_ms,min_amount,sound_enabled,tts_enabled,tts_voice")
      .eq("overlay_id", overlayId)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data) settingsRef.current = data as OverlaySettingsRow;
        },
        () => {
          // Settings are best-effort; defaults will be used.
        },
      );
  }, [overlayId]);

  useEffect(() => {
    if (!overlayId || !supabaseUrl || !supabaseAnonKey) return;
    if (clientRef.current) return;

    const client = new LiveEventClient({
      overlayId,
      channelFactory: createSupabaseChannelFactory(
        createClient(supabaseUrl, supabaseAnonKey),
      ),
      clock: { now: () => Date.now() },
      random: { random: () => Math.random() },
      onAck: (itemOverlayId, eventId, status) =>
        sendAck(itemOverlayId, eventId, status),
      onState: (state) => {
        setActiveEvent(state.activeEvent);
        void emit("live-state", state);
      },
    });

    client.start();
    clientRef.current = client;

    const listeners: (() => void)[] = [];
    const setupListeners = async () => {
      listeners.push(
        await listen<{ effectId: string }>("test-effect", (event) => {
          const effectId = event.payload.effectId;
          if (!effectId || !clientRef.current || !overlayId) return;
          const now = Date.now();
          const expiresAt = new Date(now + 60_000).toISOString();
          clientRef.current.enqueueLocal({
            id: `local-effect-${effectId}-${now}`,
            sequence: now,
            expiresAt,
            overlayId,
            local: true,
            payload: {
              donation: {
                id: `local-${now}`,
                tx_hash: "",
                donor_name: "Test Donor",
                donor_address: "",
                amount: "0",
                token: "",
                message: null,
              },
              token_display: { contract_address: "", symbol: "USDC", decimals: 7 },
              effect: {
                pack_id: defaultPackManifest.id,
                pack_version: defaultPackManifest.version,
                effect_id: effectId,
              },
            },
          });
        }),
      );

      listeners.push(
        await listen("test-alert", () => {
          if (!clientRef.current || !overlayId) return;
          const now = Date.now();
          const expiresAt = new Date(now + 60_000).toISOString();
          clientRef.current.enqueueLocal({
            id: `local-alert-${now}`,
            sequence: now,
            expiresAt,
            overlayId,
            local: true,
            payload: {
              donation: {
                id: TEST_ALERT_DONATION_ID,
                tx_hash: "",
                donor_name: "Test Donor",
                donor_address: "",
                amount: "0",
                token: "",
                message: "This is a test alert.",
              },
              token_display: { contract_address: "", symbol: "USDC", decimals: 7 },
              effect: null,
            },
          });
        }),
      );

      listeners.push(
        await listen<{ effectId: string }>("test-audio", (event) => {
          const pack = packRef.current;
          if (event.payload.effectId !== "jump-scare" || !pack) return;
          const url = packAssetUrl(pack, "jump-scare-audio");
          if (!url) return;

          testAudioRef.current?.pause();

          const audio = new Audio(url);
          audio.volume = 0.7;
          audio.play().catch(() => {
            // Audio test is best-effort.
          });
          audio.onended = () => URL.revokeObjectURL(url);
          audio.onerror = () => URL.revokeObjectURL(url);
          testAudioRef.current = audio;
        }),
      );

      listeners.push(
        await listen("emergency-stop", () => {
          testAudioRef.current?.pause();
          testAudioRef.current = null;
          clientRef.current?.emergencyStop();
        }),
      );

      listeners.push(
        await listen("reconnect-now", () => {
          clientRef.current?.reconnectNow();
        }),
      );

      listeners.push(
        await listen("request-live-state", () => {
          const state = clientRef.current?.getState() ?? {
            status: "disconnected" as ClientConnectionStatus,
            activeEvent: null,
            queueLength: 0,
            lastError: null,
          };
          void emit("live-state", state);
        }),
      );
    };

    void setupListeners();

    return () => {
      client.stop();
      for (const unlisten of listeners) {
        unlisten();
      }
    };
  }, [overlayId, supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!plan || plan.type !== "effect" || !pack) return;

    const urlsToRevoke: string[] = [];

    if (plan.media) {
      const url = packAssetUrl(pack, plan.media.assetId);
      if (url) {
        setMediaUrl(url);
        urlsToRevoke.push(url);
      }
    } else {
      setMediaUrl(null);
    }

    if (plan.audio) {
      const url = packAssetUrl(pack, plan.audio.assetId);
      if (url) {
        const audio = new Audio(url);
        audio.volume = plan.audio.volume;
        audio.play().catch(() => {
          // Effect audio is best-effort.
        });
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        audioRef.current = audio;
        urlsToRevoke.push(url);
      }
    }

    return () => {
      for (const url of urlsToRevoke) {
        URL.revokeObjectURL(url);
      }
    };
  }, [plan, pack]);

  useEffect(() => {
    if (!activeEvent) {
      setPlan(null);
      setMediaUrl(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    const { donation, token_display, effect } = activeEvent.payload;
    const tokenDecimals = token_display.decimals;
    const tokenSymbol = token_display.symbol;
    const amountDisplay = rawToDisplayAmount(donation.amount, tokenDecimals);

    const settings = settingsRef.current;
    const alertDurationMs = clampAlertDuration(
      settings?.alert_duration_ms ?? DEFAULT_ALERT_DURATION_MS,
    );
    const soundEnabled = settings?.sound_enabled ?? true;
    const ttsVoice = settings?.tts_voice ?? null;

    if (effect) {
      if (!pack) {
        // Wait for the bundled pack to validate before planning an effect.
        return;
      }

      const result = planRender(
        {
          donorName: donation.donor_name,
          amountDisplay,
          tokenSymbol,
          message: null,
          effect: { effectId: effect.effect_id },
        },
        { pack, alertDurationMs },
      );

      if (!result.ok) {
        clientRef.current?.failActive(Date.now());
        return;
      }

      setPlan(result.plan);
      alertStartedAtRef.current = Date.now();
      scheduleDismiss(result.plan.durationMs);
      return;
    }

    const minAmountRaw = displayToRawAmount(String(settings?.min_amount ?? "0"), tokenDecimals);
    const isTestAlert = donation.id === TEST_ALERT_DONATION_ID;
    if (!isTestAlert && !isAtLeastRaw(donation.amount, minAmountRaw)) {
      clientRef.current?.completeActive(Date.now());
      return;
    }

    const result = planRender(
      {
        donorName: donation.donor_name,
        amountDisplay,
        tokenSymbol,
        message: donation.message,
        effect: null,
      },
      { alertDurationMs },
    );

    if (!result.ok) {
      clientRef.current?.failActive(Date.now());
      return;
    }

    setPlan(result.plan);
    alertStartedAtRef.current = Date.now();

    playAlertSound(soundEnabled);
    scheduleDismiss(result.plan.durationMs);

    if (isTestAlert && overlayId && ttsVoice) {
      void requestTTS(
        {
          type: "overlay",
          overlayId,
          text: "Test alert. StarTip live event client is ready.",
          voice: ttsVoice,
        },
        result.plan.durationMs,
      );
    } else if (settings?.tts_enabled && ttsVoice) {
      void requestTTS({ type: "donation", donationId: donation.id }, result.plan.durationMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [activeEvent, pack, overlayId]);

  function scheduleDismiss(remainingMs: number) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPlan(null);
      setMediaUrl(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (testAudioRef.current) {
        testAudioRef.current.pause();
        testAudioRef.current = null;
      }
      clientRef.current?.completeActive(Date.now());
    }, remainingMs);
  }

  async function requestTTS(mode: TtsMode, alertDurationMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const body =
        mode.type === "donation"
          ? { donation_id: mode.donationId }
          : { overlay_id: mode.overlayId, text: mode.text, voice: mode.voice };

      const res = await fetch(`${apiBaseUrl ?? ""}/api/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error("audio load failed"));
        audio.src = url;
      });
      const audioDurationMs = audio.duration * 1000;
      const elapsed = Date.now() - (alertStartedAtRef.current ?? Date.now());
      const remaining = Math.max(alertDurationMs, audioDurationMs) - elapsed;
      if (remaining > 0) {
        scheduleDismiss(remaining);
      }

      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      audioRef.current = audio;
      await audio.play();
    } catch {
      // Alert Reading is optional; a failed read must not hide the alert.
    } finally {
      clearTimeout(timeout);
    }
  }

  if (plan?.type === "donation-alert") {
    return (
      <div className="overlay">
        <div className="overlay-alert" aria-live="polite">
          <div className="overlay-alert-header">
            <span className="overlay-alert-donor">{plan.donorName}</span>
            <span className="overlay-alert-amount">
              {plan.amountDisplay} {plan.tokenSymbol}
            </span>
          </div>
          {plan.message ? <p className="overlay-alert-message">{plan.message}</p> : null}
        </div>
      </div>
    );
  }

  if (plan?.type === "effect") {
    return (
      <div className="overlay" aria-live="polite">
        <EffectView plan={plan} mediaUrl={mediaUrl ?? null} />
        <div className="overlay-attribution">
          <span className="overlay-attribution-donor">{plan.attribution.donorName}</span>
          <span className="overlay-attribution-amount">
            {plan.attribution.amountDisplay} {plan.attribution.tokenSymbol}
          </span>
          <span className="overlay-attribution-effect">{plan.attribution.effectName}</span>
        </div>
      </div>
    );
  }

  return <div className="overlay" aria-live="polite" />;
}

function EffectView({ plan, mediaUrl }: { plan: RenderPlan & { type: "effect" }; mediaUrl: string | null }) {
  if (plan.effectType === "jump-scare") {
    return (
      <div className="effect-jump-scare">
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt=""
            className="effect-jump-scare-media"
            style={{ maxWidth: `${plan.media?.maxDisplayPct ?? 80}%`, maxHeight: `${plan.media?.maxDisplayPct ?? 80}%` }}
          />
        ) : null}
      </div>
    );
  }

  if (plan.effectType === "screen-flash") {
    const geometry = plan.geometry as { type: "screen-flash"; color: string };
    return (
      <div
        className="effect-screen-flash"
        style={{ background: geometry.color }}
      />
    );
  }

  if (plan.effectType === "screen-cover") {
    const geometry = plan.geometry as { type: "screen-cover"; obscuredPct: number };
    const obscured = geometry.obscuredPct;
    const offset = (100 - obscured) / 2;
    return (
      <div
        className="effect-screen-cover"
        style={{
          top: `${offset}%`,
          left: `${offset}%`,
          width: `${obscured}vw`,
          height: `${obscured}vh`,
        }}
      />
    );
  }

  if (plan.effectType === "tunnel-vision") {
    const geometry = plan.geometry as { type: "tunnel-vision"; visibleDiameterPct: number };
    const radius = geometry.visibleDiameterPct / 2;
    return (
      <div
        className="effect-tunnel-vision"
        style={{
          background: `radial-gradient(circle at center, transparent ${radius}%, rgba(0, 0, 0, 0.92) ${radius + 0.5}%)`,
        }}
      />
    );
  }

  return null;
}
