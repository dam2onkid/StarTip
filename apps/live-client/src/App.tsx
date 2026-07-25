import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [available, target] = await Promise.all([
          invoke<Display[]>("get_available_displays"),
          invoke<string | null>("get_target_display"),
        ]);

        if (cancelled) return;

        setDisplays(available);

        const initialTarget = target ?? available.find((d) => d.primary)?.name ?? available[0]?.name ?? "";
        setSelectedDisplay(initialTarget);

        const running = await invoke<boolean>("is_overlay_running");
        if (!cancelled) {
          setIsRunning(running);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
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
      setIsRunning(true);
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
      setIsRunning(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
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

        <div className="actions">
          <button
            className="button button-primary"
            onClick={handleStart}
            disabled={isBusy || !selectedDisplay}
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
        </div>

        {isRunning && (
          <div className="status status-running">
            <span className="status-dot" />
            Game overlay is running
          </div>
        )}

        {!isRunning && selectedDisplay && (
          <div className="status status-idle">Ready to launch on {selectedDisplay}</div>
        )}

        {error && <div className="status status-error">{error}</div>}
      </section>
    </main>
  );
}

export default App;
