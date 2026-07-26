import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  type ClientConnectionStatus,
  type LiveEventClientState,
} from "@startip/shared/live-events/client";
import { GameOverlay } from "./overlay";
import "./App.css";

const BROWSER_OVERLAY_ORIGIN = "http://localhost:3000";

interface Display {
  name: string;
  position: [number, number];
  size: [number, number];
  scale_factor: number;
  primary: boolean;
}

function isTauriRuntime() {
  if (typeof window === "undefined") return false;

  return typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}

function getWindowLabel() {
  if (!isTauriRuntime()) return "main";

  return getCurrentWebviewWindow().label;
}

function extractOverlayId(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^[0-9a-f]{32}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  const pathMatch = normalized.match(/\/overlay\/([0-9a-f]{32})(?:[/?#]|$)/i);
  if (pathMatch) {
    return pathMatch[1].toLowerCase();
  }

  try {
    const url = new URL(normalized);
    const match = url.pathname.match(/\/overlay\/([0-9a-f]{32})(?:\/|$)/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {}

  return null;
}

function getBrowserPreviewUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    return url.toString();
  } catch {}

  const overlayId = extractOverlayId(normalized);
  if (!overlayId) return null;

  return `${BROWSER_OVERLAY_ORIGIN}/overlay/${overlayId}`;
}

type ConnectionStatusLabel =
  | "Disconnected"
  | "Connecting"
  | "Ready"
  | "Overlay Running"
  | "Connection Lost";

const STATUS_CLASS: Record<ConnectionStatusLabel, string> = {
  Disconnected: "disconnected",
  Connecting: "connecting",
  Ready: "ready",
  "Overlay Running": "overlay-running",
  "Connection Lost": "connection-lost",
};

function displayStatus(
  connectionStatus: ClientConnectionStatus,
  isRunning: boolean,
): ConnectionStatusLabel {
  if (isRunning && connectionStatus === "ready") return "Overlay Running";
  if (connectionStatus === "ready") return "Ready";
  if (connectionStatus === "connecting") return "Connecting";
  if (connectionStatus === "connection-lost") return "Connection Lost";
  return "Disconnected";
}

function App() {
  if (getWindowLabel() === "overlay") {
    return <GameOverlay />;
  }

  return <ControlWindow />;
}

function ControlWindow() {
  const tauriRuntime = isTauriRuntime();
  const [overlayId, setOverlayId] = useState("");
  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liveState, setLiveState] = useState<LiveEventClientState>({
    status: "disconnected",
    activeEvent: null,
    queueLength: 0,
    lastError: null,
  });
  const [emergencyShortcutRegistered, setEmergencyShortcutRegistered] = useState(false);
  const [browserPreviewWindow, setBrowserPreviewWindow] = useState<Window | null>(null);

  useEffect(() => {
    if (!tauriRuntime) {
      setDisplays([
        {
          name: "Browser Preview",
          position: [0, 0],
          size: [0, 0],
          scale_factor: 1,
          primary: true,
        },
      ]);
      setSelectedDisplay("Browser Preview");
      return;
    }

    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      try {
        const [available, target, id, running, shortcutRegistered] = await Promise.all([
          invoke<Display[]>("get_available_displays"),
          invoke<string | null>("get_target_display"),
          invoke<string | null>("get_overlay_id"),
          invoke<boolean>("is_overlay_running"),
          invoke<boolean>("is_emergency_shortcut_registered"),
        ]);

        if (cancelled) return;

        setDisplays(available);
        setOverlayId(id ?? "");
        setIsRunning(running);
        setEmergencyShortcutRegistered(shortcutRegistered);

        const initialTarget = target ?? available.find((d) => d.primary)?.name ?? available[0]?.name ?? "";
        setSelectedDisplay(initialTarget);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }

      unlisteners.push(
        await listen<LiveEventClientState>("live-state", (event) => {
          setLiveState(event.payload);
        }),
      );

      unlisteners.push(
        await listen<{ running: boolean }>("overlay-state", (event) => {
          setIsRunning(event.payload.running);
        }),
      );

      // Ask the running overlay for its current state on mount.
      void emit("request-live-state");
    };

    void setup();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [tauriRuntime]);

  async function handleOverlayIdChange(value: string) {
    setOverlayId(value);
    if (!tauriRuntime) return;

    const normalizedOverlayId = extractOverlayId(value);
    if (normalizedOverlayId) {
      try {
        await invoke("set_overlay_id", { id: normalizedOverlayId });
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    }
  }

  async function handleDisplayChange(name: string) {
    setSelectedDisplay(name);
    if (!tauriRuntime) return;

    setIsBusy(true);
    setError(null);
    try {
      await invoke("set_target_display", { name });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStart() {
    if (!tauriRuntime) {
      const previewUrl = getBrowserPreviewUrl(overlayId);
      if (!previewUrl) {
        setError("Enter a valid Overlay ID or overlay URL.");
        return;
      }

      const openedWindow = window.open(previewUrl, "_blank");
      if (!openedWindow) {
        setError("Could not open the browser overlay preview window.");
        return;
      }

      setBrowserPreviewWindow(openedWindow);
      setIsRunning(true);
      setError(null);
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      await invoke("start_overlay");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStop() {
    if (!tauriRuntime) {
      browserPreviewWindow?.close();
      setBrowserPreviewWindow(null);
      setIsRunning(false);
      setError(null);
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      await invoke("stop_overlay");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEmergencyStop() {
    if (!tauriRuntime) return;

    setIsBusy(true);
    setError(null);
    try {
      await invoke("emergency_stop");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  }

  function handleReconnectNow() {
    if (!tauriRuntime) return;
    void emit("reconnect-now");
  }

  function handleTestEffect(effectId: string) {
    if (!tauriRuntime) return;
    void emit("test-effect", { effectId });
  }

  function handleTestAlert() {
    if (!tauriRuntime) return;
    void emit("test-alert");
  }

  function handleTestJumpScareAudio() {
    if (!tauriRuntime) return;
    void emit("test-audio", { effectId: "jump-scare" });
  }

  const statusLabel = displayStatus(liveState.status, isRunning);
  const browserPreviewUrl = getBrowserPreviewUrl(overlayId);

  function activeEventSummary() {
    if (!liveState.activeEvent) return "None";
    if (liveState.activeEvent.payload.effect) {
      return `Effect: ${liveState.activeEvent.payload.effect.effect_id}`;
    }
    return `Donation alert from ${liveState.activeEvent.payload.donation.donor_name}`;
  }

  return (
    <main className="control">
      <header className="control-header">
        <div className="control-header-bar">
          <span className="control-kicker">Live event control</span>
          <span className={`control-mode-pill ${tauriRuntime ? "control-mode-pill-live" : "control-mode-pill-preview"}`}>
            {tauriRuntime ? "Desktop shell" : "Browser preview"}
          </span>
        </div>

        <div className="control-hero">
          <div className="control-hero-copy">
            <h1 className="control-title">StarTip Live Event Client</h1>
            <p className="control-subtitle">
              Run the creator-facing overlay, choose the target display, and keep emergency controls within one reach.
            </p>
          </div>

          <aside className="signal-card" aria-label="Current overlay state">
            <span className="signal-card-label">Signal</span>
            <div className={`signal-card-status signal-card-status-${STATUS_CLASS[statusLabel]}`}>
              <span className="signal-card-dot" />
              <span>{statusLabel}</span>
            </div>
            <dl className="signal-card-meta">
              <div>
                <dt>Queue</dt>
                <dd>{liveState.queueLength}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{tauriRuntime ? "Desktop overlay" : "Web fallback"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </header>

      <section className="control-grid">
        <section className="panel panel-session">
          <div className="panel-header">
            <div>
              <span className="panel-label">Session</span>
              <h2 className="panel-title">Attach the current overlay</h2>
            </div>
          </div>

        {!tauriRuntime ? (
          <div className="status status-idle">
            Browser preview mode. Start Overlay opens the web fallback so you can test with pnpm dev before launching Tauri.
          </div>
        ) : null}

        <label className="field">
          <span className="field-label">Overlay ID</span>
          <input
            className="field-input"
            value={overlayId}
            onChange={(e) => handleOverlayIdChange(e.currentTarget.value)}
            placeholder="Paste overlay URL or enter overlay ID"
            disabled={isBusy}
          />
          <span className="field-hint">
            Paste the full browser overlay URL for local preview, or paste the raw overlay ID when running the desktop shell.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Target Display</span>
          <select
            className="field-select"
            value={selectedDisplay}
            onChange={(e) => handleDisplayChange(e.currentTarget.value)}
            disabled={!tauriRuntime || isBusy || displays.length === 0}
          >
            {displays.map((display) => (
              <option key={display.name} value={display.name}>
                {display.name} {display.primary ? "(primary)" : ""} - {display.size[0]}x{display.size[1]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            In browser preview this stays pinned to a local placeholder. In Tauri it targets the real creator display.
          </span>
        </label>
        </section>

        <section className="panel panel-runtime">
          <div className="panel-header">
            <div>
              <span className="panel-label">Runtime</span>
              <h2 className="panel-title">Monitor the live signal</h2>
            </div>
          </div>

          <div className="connection-card">
          <div className={`connection-status connection-status-${STATUS_CLASS[statusLabel]}`}>
            <span className="connection-status-dot" />
            <span className="connection-status-label">{statusLabel}</span>
          </div>

          <div className="connection-meta">
            <div className="connection-meta-row">
              <span className="connection-meta-key">Active event</span>
              <span className="connection-meta-value">{activeEventSummary()}</span>
            </div>
            <div className="connection-meta-row">
              <span className="connection-meta-key">Queue length</span>
              <span className="connection-meta-value">{liveState.queueLength}</span>
            </div>
            {liveState.status === "connection-lost" && liveState.lastError ? (
              <div className="connection-meta-row">
                <span className="connection-meta-key">Last error</span>
                <span className="connection-meta-value connection-meta-value-error">{liveState.lastError}</span>
              </div>
            ) : null}
          </div>
        </div>
        </section>

        <section className="panel panel-actions">
          <div className="panel-header">
            <div>
              <span className="panel-label">Controls</span>
              <h2 className="panel-title">Drive the overlay</h2>
            </div>
          </div>

          <div className="actions">
          <button
            className="button button-primary"
            onClick={handleStart}
            disabled={tauriRuntime ? isBusy || !selectedDisplay || isRunning : isBusy || !browserPreviewUrl || isRunning}
          >
            Start Overlay
          </button>
          <button
            className="button button-secondary"
            onClick={handleStop}
            disabled={tauriRuntime ? isBusy || !isRunning : isBusy || !isRunning}
          >
            Stop Overlay
          </button>
          <button
            className="button button-secondary"
            onClick={handleReconnectNow}
            disabled={!tauriRuntime || liveState.status !== "connection-lost"}
          >
            Reconnect Now
          </button>
          <button
            className="button button-danger"
            onClick={handleEmergencyStop}
            disabled={!tauriRuntime || isBusy || !isRunning}
          >
            Emergency Stop
          </button>
        </div>
        </section>

        <section className="panel panel-utility">
          <div className="panel-header">
            <div>
              <span className="panel-label">Safety</span>
              <h2 className="panel-title">Emergency shortcut</h2>
            </div>
          </div>

          <div className="shortcut-info">
          <span className="shortcut-label">Emergency shortcut</span>
          <span className="shortcut-combo">Ctrl + Opt + Cmd + E</span>
          <span className={`shortcut-state ${emergencyShortcutRegistered ? "shortcut-state-registered" : "shortcut-state-unregistered"}`}>
            {emergencyShortcutRegistered ? "registered" : "not registered"}
          </span>
        </div>
        </section>

        <section className="panel panel-tests">
          <div className="panel-header">
            <div>
              <span className="panel-label">Local tests</span>
              <h2 className="panel-title">Dry-run the renderer</h2>
            </div>
          </div>

          <div className="test-controls">
          <span className="test-controls-label">Local tests</span>
          <div className="test-controls-row">
            <button
              className="button button-test"
              onClick={() => handleTestEffect("jump-scare")}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Jump Scare
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("screen-flash")}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Screen Flash
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("screen-cover")}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Screen Cover
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("tunnel-vision")}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Tunnel Vision
            </button>
          </div>
          <div className="test-controls-row">
            <button
              className="button button-test"
              onClick={handleTestAlert}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Alert + TTS
            </button>
            <button
              className="button button-test"
              onClick={handleTestJumpScareAudio}
              disabled={!tauriRuntime || isBusy || !isRunning}
            >
              Jump Scare Audio
            </button>
          </div>
        </div>
        </section>

        {error && (
          <section className="panel panel-error">
            <div className="status status-error">{error}</div>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
