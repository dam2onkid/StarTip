import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { LiveEventQueue } from "@startip/shared/live-events/queue";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const alertSoundUrl = (import.meta.env.VITE_ALERT_SOUND_URL as string | undefined)
  ?? `${apiBaseUrl ?? ""}/alert.mp3`;

const DEFAULT_ALERT_DURATION_MS = 10_000;
const MIN_ALERT_DURATION_MS = 1_000;
const MAX_ALERT_DURATION_MS = 60_000;
const QUEUE_TICK_MS = 1_000;

interface LiveEventEffect {
  pack_id: string;
  pack_version: string;
  effect_id: string;
}

interface LiveEventRow {
  id: string;
  creator_profile_id: string;
  overlay_id: string;
  donation_id: string;
  sequence: number;
  payload: {
    donation: {
      id: string;
      tx_hash: string;
      donor_name: string;
      donor_address: string;
      amount: string;
      token: string;
      message: string | null;
    };
    creator: { profile_id: string; overlay_id: string };
    token_display: { contract_address: string; symbol: string; decimals: number };
    effect: LiveEventEffect | null;
  };
  status: string;
  expires_at: string;
  created_at: string;
}

interface OverlaySettingsRow {
  alert_duration_ms: number;
  min_amount: number;
  sound_enabled: boolean;
  tts_enabled: boolean;
  tts_voice: string | null;
}

type QueueEvent = LiveEventRow & { expiresAt: string };

function clampAlertDuration(ms: number) {
  return Math.min(Math.max(ms, MIN_ALERT_DURATION_MS), MAX_ALERT_DURATION_MS);
}

function playBeep() {
  try {
    const Ctx =
      (
        window as typeof window & {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).AudioContext ?? window.AudioContext;
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

function effectAudioUrl(pack: ValidatedPack, assetId: string): string | null {
  const bytes = defaultPackAssets[assetId];
  const asset = pack.manifest.assets[assetId];
  if (!bytes || !asset) return null;
  const blob = new Blob([bytes], { type: asset.contentType });
  return URL.createObjectURL(blob);
}

function effectMediaUrl(pack: ValidatedPack, assetId: string): string | null {
  const bytes = defaultPackAssets[assetId];
  const asset = pack.manifest.assets[assetId];
  if (!bytes || !asset) return null;
  const blob = new Blob([bytes], { type: asset.contentType });
  return URL.createObjectURL(blob);
}

function sendAck(eventId: string, status: string) {
  if (!apiBaseUrl) return;
  void fetch(`${apiBaseUrl}/api/live-events/${eventId}/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
    keepalive: true,
  });
}

export function GameOverlay() {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RenderPlan | null>(null);
  const [pack, setPack] = useState<ValidatedPack | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<QueueEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertStartedAtRef = useRef<number | null>(null);
  const settingsRef = useRef<OverlaySettingsRow | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const queueRef = useRef<LiveEventQueue<QueueEvent> | null>(null);
  if (!queueRef.current) {
    queueRef.current = new LiveEventQueue<QueueEvent>({
      clock: { now: () => Date.now() },
      onAck: (event, status) => sendAck(event.id, status),
    });
  }

  useEffect(() => {
    const unsubscribe = queueRef.current!.subscribe((state) => {
      setActiveEvent((prev) =>
        prev?.id === state.active?.item.id
          ? prev
          : (state.active?.item ?? null),
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => queueRef.current?.tick(), QUEUE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    validatePack(defaultPackManifest, { assets: defaultPackAssets })
      .then((res) => {
        if (!cancelled && res.ok) {
          setPack(res);
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

    const channel = supabase
      .channel("live-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_events",
          filter: `overlay_id=eq.${overlayId}`,
        },
        (payload: { new: LiveEventRow }) => {
          const event = payload.new;
          queueRef.current?.enqueue({ ...event, expiresAt: event.expires_at });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [overlayId]);

  useEffect(() => {
    if (!plan || plan.type !== "effect" || !pack) return;

    const urlsToRevoke: string[] = [];

    if (plan.media) {
      const url = effectMediaUrl(pack, plan.media.assetId);
      if (url) {
        setMediaUrl(url);
        urlsToRevoke.push(url);
      }
    } else {
      setMediaUrl(null);
    }

    if (plan.audio) {
      const url = effectAudioUrl(pack, plan.audio.assetId);
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

    if (!pack) {
      // Wait for the bundled pack to validate before planning an effect.
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
    const ttsEnabled = settings?.tts_enabled ?? false;
    const ttsVoice = settings?.tts_voice ?? null;

    if (effect) {
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
        queueRef.current?.failActive(Date.now());
        return;
      }

      setPlan(result.plan);
      alertStartedAtRef.current = Date.now();
      scheduleDismiss(result.plan.durationMs);
      return;
    }

    const minAmountRaw = displayToRawAmount(String(settings?.min_amount ?? "0"), tokenDecimals);
    if (!isAtLeastRaw(donation.amount, minAmountRaw)) {
      queueRef.current?.completeActive(Date.now());
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
      queueRef.current?.failActive(Date.now());
      return;
    }

    setPlan(result.plan);
    alertStartedAtRef.current = Date.now();

    playAlertSound(soundEnabled);
    scheduleDismiss(result.plan.durationMs);

    if (ttsEnabled && ttsVoice) {
      void requestTTS(donation.id, result.plan.durationMs);
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
  }, [activeEvent, pack]);

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
      queueRef.current?.completeActive(Date.now());
    }, remainingMs);
  }

  async function requestTTS(donationId: string, alertDurationMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${apiBaseUrl ?? ""}/api/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ donation_id: donationId }),
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
