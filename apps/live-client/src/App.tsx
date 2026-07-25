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

interface Display {
  name: string;
  position: [number, number];
  size: [number, number];
  scale_factor: number;
  primary: boolean;
}

const currentWindow = getCurrentWebviewWindow();

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
  if (currentWindow.label === "overlay") {
    return <GameOverlay />;
  }

  return <ControlWindow />;
}

function ControlWindow() {
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

  useEffect(() => {
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
  }, []);

  async function handleOverlayIdChange(value: string) {
    setOverlayId(value);
    if (value.trim()) {
      try {
        await invoke("set_overlay_id", { id: value.trim() });
      } catch (e) {
        setError(String(e));
      }
    }
  }

  async function handleDisplayChange(name: string) {
    setSelectedDisplay(name);
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
    void emit("reconnect-now");
  }

  function handleTestEffect(effectId: string) {
    void emit("test-effect", { effectId });
  }

  function handleTestAlert() {
    void emit("test-alert");
  }

  function handleTestJumpScareAudio() {
    void emit("test-audio", { effectId: "jump-scare" });
  }

  const statusLabel = displayStatus(liveState.status, isRunning);

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
        <h1 className="control-title">StarTip Live Event Client</h1>
        <p className="control-subtitle">Control window for the game overlay</p>
      </header>

      <section className="control-form">
        <label className="field">
          <span className="field-label">Overlay ID</span>
          <input
            className="field-input"
            value={overlayId}
            onChange={(e) => handleOverlayIdChange(e.currentTarget.value)}
            placeholder="Enter overlay ID"
            disabled={isBusy}
          />
        </label>

        <label className="field">
          <span className="field-label">Target Display</span>
          <select
            className="field-select"
            value={selectedDisplay}
            onChange={(e) => handleDisplayChange(e.currentTarget.value)}
            disabled={isBusy || displays.length === 0}
          >
            {displays.map((display) => (
              <option key={display.name} value={display.name}>
                {display.name} {display.primary ? "(primary)" : ""} - {display.size[0]}x{display.size[1]}
              </option>
            ))}
          </select>
        </label>

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

        <div className="actions">
          <button
            className="button button-primary"
            onClick={handleStart}
            disabled={isBusy || !selectedDisplay || isRunning}
          >
            Start Overlay
          </button>
          <button
            className="button button-secondary"
            onClick={handleStop}
            disabled={isBusy || !isRunning}
          >
            Stop Overlay
          </button>
          <button
            className="button button-secondary"
            onClick={handleReconnectNow}
            disabled={liveState.status !== "connection-lost"}
          >
            Reconnect Now
          </button>
          <button
            className="button button-danger"
            onClick={handleEmergencyStop}
            disabled={isBusy || !isRunning}
          >
            Emergency Stop
          </button>
        </div>

        <div className="shortcut-info">
          <span className="shortcut-label">Emergency shortcut</span>
          <span className="shortcut-combo">Ctrl + Opt + Cmd + E</span>
          <span className={`shortcut-state ${emergencyShortcutRegistered ? "shortcut-state-registered" : "shortcut-state-unregistered"}`}>
            {emergencyShortcutRegistered ? "registered" : "not registered"}
          </span>
        </div>

        <div className="test-controls">
          <span className="test-controls-label">Local tests</span>
          <div className="test-controls-row">
            <button
              className="button button-test"
              onClick={() => handleTestEffect("jump-scare")}
              disabled={isBusy || !isRunning}
            >
              Jump Scare
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("screen-flash")}
              disabled={isBusy || !isRunning}
            >
              Screen Flash
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("screen-cover")}
              disabled={isBusy || !isRunning}
            >
              Screen Cover
            </button>
            <button
              className="button button-test"
              onClick={() => handleTestEffect("tunnel-vision")}
              disabled={isBusy || !isRunning}
            >
              Tunnel Vision
            </button>
          </div>
          <div className="test-controls-row">
            <button
              className="button button-test"
              onClick={handleTestAlert}
              disabled={isBusy || !isRunning}
            >
              Alert + TTS
            </button>
            <button
              className="button button-test"
              onClick={handleTestJumpScareAudio}
              disabled={isBusy || !isRunning}
            >
              Jump Scare Audio
            </button>
          </div>
        </div>

        {error && <div className="status status-error">{error}</div>}
      </section>
    </main>
  );
}

export default App;
