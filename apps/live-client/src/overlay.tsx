import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createClient } from "@supabase/supabase-js";
import { planRender, type RenderPlan } from "@startip/shared/overlay/renderer";
import {
  displayToRawAmount,
  isAtLeastRaw,
  rawToDisplayAmount,
} from "@startip/shared/stellar/amount";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const alertSoundUrl = (import.meta.env.VITE_ALERT_SOUND_URL as string | undefined)
  ?? `${apiBaseUrl ?? ""}/alert.mp3`;

const DEFAULT_ALERT_DURATION_MS = 10_000;
const MIN_ALERT_DURATION_MS = 1_000;
const MAX_ALERT_DURATION_MS = 60_000;

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
    effect: null;
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

function clampAlertDuration(ms: number) {
  return Math.min(Math.max(ms, MIN_ALERT_DURATION_MS), MAX_ALERT_DURATION_MS);
}

function playBeep() {
  try {
    const Ctx = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? window.AudioContext;
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

export function GameOverlay() {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RenderPlan | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertStartedAtRef = useRef<number | null>(null);
  const currentEventIdRef = useRef<string | null>(null);
  const settingsRef = useRef<OverlaySettingsRow | null>(null);

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

    // Load the Creator's overlay settings once so each Live Event renders
    // immediately without waiting for a settings round-trip.
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
          void handleLiveEvent(payload.new);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [overlayId]);

  async function handleLiveEvent(event: LiveEventRow) {
    sendAck(event.id, "started");
    currentEventIdRef.current = event.id;

    const { donation, token_display } = event.payload;

    const tokenDecimals = token_display.decimals;
    const tokenSymbol = token_display.symbol;

    const settings = settingsRef.current;
    const alertDurationMs = clampAlertDuration(settings?.alert_duration_ms ?? DEFAULT_ALERT_DURATION_MS);
    const soundEnabled = settings?.sound_enabled ?? true;
    const ttsEnabled = settings?.tts_enabled ?? false;
    const ttsVoice = settings?.tts_voice ?? null;

    const minAmountRaw = displayToRawAmount(String(settings?.min_amount ?? "0"), tokenDecimals);
    if (!isAtLeastRaw(donation.amount, minAmountRaw)) {
      sendAck(event.id, "completed");
      return;
    }

    const amountDisplay = rawToDisplayAmount(donation.amount, tokenDecimals);
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
      sendAck(event.id, "failed");
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setPlan(result.plan);
    alertStartedAtRef.current = Date.now();

    playAlertSound(soundEnabled);
    scheduleDismiss(result.plan.durationMs);

    if (ttsEnabled && ttsVoice) {
      void requestTTS(donation.id, result.plan.durationMs);
    }
  }

  function scheduleDismiss(remainingMs: number) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setPlan(null);
      if (currentEventIdRef.current) {
        sendAck(currentEventIdRef.current, "completed");
      }
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

  function sendAck(eventId: string, status: string) {
    if (!apiBaseUrl) return;
    void fetch(`${apiBaseUrl}/api/live-events/${eventId}/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
      keepalive: true,
    });
  }

  if (plan?.type !== "donation-alert") {
    return <div className="overlay" aria-live="polite" />;
  }

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
