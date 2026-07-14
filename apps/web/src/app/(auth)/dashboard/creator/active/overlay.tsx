"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserClient } from "@/lib/supabase/client";
import { displayToRawAmount, rawToDisplayAmount } from "@/lib/stellar/amount";
import { DEFAULT_ALERT_DURATION_MS } from "@/lib/overlay/settings";
import { type TokenAllowlistEntry } from "@/lib/donations/token";
import { CardTitleWithInfo, CopyValueRow } from "../shared";
import { StatusToast, computePct, overlaySettingsErrorMessage, goalErrorMessage } from "../utils";
import type { Status } from "../types";

/** Overlay URL: show `/overlay/[overlay_id]` with a copy + regenerate action. */
export function OverlayUrlCard({
  overlayId,
  onRegenerate,
}: {
  overlayId: string | null | undefined;
  onRegenerate?: (newOverlayId: string) => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const path = overlayId ? `/overlay/${overlayId}` : "";
  if (!overlayId) return null;

  async function regenerate() {
    setRegenerating(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/overlay/regenerate", { method: "POST" });
      const body = (await res.json()) as { overlay_id?: string; error?: string };
      if (res.status === 200 && body.overlay_id) {
        onRegenerate?.(body.overlay_id);
        setStatus({ kind: "success", message: "Overlay URL regenerated." });
      } else {
        setStatus({
          kind: "error",
          message: overlaySettingsErrorMessage(body.error ?? "unknown"),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not regenerate the Overlay URL." });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Overlay URL"
          info="Add this URL as a browser source in OBS to show donation alerts on your stream."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3" data-testid="overlay-url-card">
        <CopyValueRow
          label="Overlay URL"
          value={path}
          copyValue={path}
          absoluteUrl
          testId="overlay-url"
          copyTestId="overlay-copy"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={regenerate}
          loading={regenerating}
          disabled={regenerating}
          className="self-start"
          data-testid="overlay-regenerate"
        >
          Regenerate URL
        </Button>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}

interface TtsVoice {
  id: string;
  name: string;
  locale: string;
  gender: string;
}

/**
 * Overlay Settings card: configure alert duration, min amount, sound, and
 * Alert Reading (Text-to-Speech) voice.
 */
export function OverlaySettingsCard({ overlayId }: { overlayId: string | null | undefined }) {
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_ALERT_DURATION_MS);
  const [minAmount, setMinAmount] = useState<string>("0");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(false);
  const [ttsVoice, setTtsVoice] = useState<string>("");
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Load the current settings and the available TTS voices on mount (and when
  // the overlay ID changes). Both are fetched in parallel and the form stays
  // disabled until they settle so the user cannot save stale defaults.
  useEffect(() => {
    if (!overlayId) return;
    let alive = true;

    const settingsPromise = fetch(
      `/api/overlay-settings?overlay_id=${encodeURIComponent(overlayId)}`,
    )
      .then(async (res) => {
        if (!res.ok) return;
        return (await res.json()) as {
          alert_duration_ms?: number;
          min_amount?: string | number;
          sound_enabled?: boolean;
          tts_enabled?: boolean;
          tts_voice?: string | null;
        };
      })
      .catch(() => {
        // Network error: keep defaults; the user can still save.
        return undefined;
      });

    const voicesPromise = fetch("/api/tts/voices")
      .then(async (res) => {
        if (!res.ok) return [];
        const body = (await res.json()) as { voices?: TtsVoice[] };
        return Array.isArray(body.voices) ? body.voices : [];
      })
      .catch(() => {
        // Voice list is optional: the picker falls back to empty.
        return [];
      });

    Promise.all([settingsPromise, voicesPromise]).then(([settings, voices]) => {
      if (!alive) return;
      setVoices(voices);
      if (settings) {
        setDurationMs(settings.alert_duration_ms ?? DEFAULT_ALERT_DURATION_MS);
        setMinAmount(String(settings.min_amount ?? "0"));
        setSoundEnabled(settings.sound_enabled === true);
        setTtsEnabled(settings.tts_enabled === true);
        setTtsVoice(settings.tts_voice ?? "");
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [overlayId]);

  if (!overlayId) return null;

  async function save() {
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/overlay-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alert_duration_ms: durationMs,
          min_amount: Number(minAmount),
          sound_enabled: soundEnabled,
          tts_enabled: ttsEnabled,
          tts_voice: ttsVoice || null,
        }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as {
          min_amount: string | number;
          tts_voice: string | null;
        };
        setMinAmount(String(body.min_amount));
        setTtsVoice(body.tts_voice ?? "");
        setStatus({ kind: "success", message: "Overlay settings saved." });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({
          kind: "error",
          message: overlaySettingsErrorMessage(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not save overlay settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Overlay settings"
          info="Control how donation alerts behave on your stream overlay: how long each alert stays on screen, the minimum donation amount that triggers an alert, sound, and Alert Reading."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4" data-testid="overlay-settings-card">
        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-duration-input"
          >
            Alert duration (ms)
          </label>
          <Input
            id="overlay-duration-input"
            type="number"
            min={1000}
            max={60000}
            step={500}
            className="max-w-[10rem]"
            value={durationMs}
            disabled={loading || saving}
            onChange={(e) => setDurationMs(Number(e.target.value))}
            data-testid="overlay-duration-input"
          />
          <p className="text-[0.65rem] text-muted-foreground/70">
            1000-60000ms. Default 10000ms (10 seconds).
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-min-amount-input"
          >
            Minimum amount
          </label>
          <Input
            id="overlay-min-amount-input"
            type="number"
            min={0}
            step="0.01"
            className="max-w-[10rem]"
            value={minAmount}
            disabled={loading || saving}
            onChange={(e) => setMinAmount(e.target.value)}
            data-testid="overlay-min-amount-input"
          />
          <p className="text-[0.65rem] text-muted-foreground/70">
            Donations below this amount are silently recorded but not shown.
            0 shows every donation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="overlay-sound-toggle"
            type="checkbox"
            className="h-4 w-4 rounded border-foreground/20 accent-primary"
            checked={soundEnabled}
            disabled={loading || saving}
            onChange={(e) => setSoundEnabled(e.target.checked)}
            data-testid="overlay-sound-toggle"
          />
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-sound-toggle"
          >
            Play a sound on new donations
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="overlay-tts-toggle"
            type="checkbox"
            className="h-4 w-4 rounded border-foreground/20 accent-primary"
            checked={ttsEnabled}
            disabled={loading || saving}
            onChange={(e) => setTtsEnabled(e.target.checked)}
            data-testid="overlay-tts-toggle"
          />
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-tts-toggle"
          >
            Read donation alerts aloud
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-voice-select"
          >
            Voice
          </label>
          <select
            id="overlay-voice-select"
            className="max-w-[12rem] rounded-md border border-foreground/10 bg-background px-3 py-2 text-sm"
            value={ttsVoice}
            disabled={loading || saving}
            onChange={(e) => setTtsVoice(e.target.value)}
            data-testid="overlay-voice-select"
          >
            <option value="">No voice selected</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.locale})
              </option>
            ))}
          </select>
          <p className="text-[0.65rem] text-muted-foreground/70">
            The voice used when Alert Reading is on. The list is always the
            Worker&apos;s currently supported voices.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={save}
          loading={saving}
          disabled={loading || saving}
          className="self-start"
          data-testid="overlay-settings-save"
        >
          Save
        </Button>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}

/**
 * Donation Goal card: set a target amount + token, see progress toward it,
 * and clear the goal.
 */
export function DonationGoalCard({
  handle,
  goal,
  tokens: tokensProp,
}: {
  handle: string | null;
  goal: { current: string; target: string; pct: number; token: string } | null;
  tokens?: TokenAllowlistEntry[];
}) {
  const hasTokensProp = (tokensProp?.length ?? 0) > 0;
  const [fetchedTokens, setFetchedTokens] = useState<TokenAllowlistEntry[]>([]);
  const [tokenContract, setTokenContract] = useState<string>("");
  const [targetDisplay, setTargetDisplay] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [liveTargetRaw, setLiveTargetRaw] = useState<string>(goal?.target ?? "0");

  const tokens = useMemo(
    () => (hasTokensProp ? tokensProp ?? [] : fetchedTokens),
    [hasTokensProp, tokensProp, fetchedTokens],
  );

  useEffect(() => {
    if (!handle) return;
    let alive = true;

    const supabase = createBrowserClient();
    const tokensPromise: PromiseLike<TokenAllowlistEntry[]> = hasTokensProp
      ? Promise.resolve(tokensProp ?? [])
      : supabase
          .from("tokens")
          .select("contract_address,symbol,name,issuer,decimals,icon_url")
          .then(({ data, error: fetchErr }) => {
            if (fetchErr || !data) return [] as TokenAllowlistEntry[];
            return data as TokenAllowlistEntry[];
          });

    const goalPromise = fetch(
      `/api/creators/${encodeURIComponent(handle)}/goal`,
    ).then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as { target_amount: string; token: string } | null;
    });

    Promise.all([tokensPromise, goalPromise])
      .then(([toks, g]) => {
        if (!alive) return;
        const resolvedTokens = toks ?? [];
        if (!hasTokensProp) setFetchedTokens(resolvedTokens);
        if (g) {
          setTokenContract(g.token);
          const tk = resolvedTokens.find((t) => t.contract_address === g.token);
          setTargetDisplay(tk ? rawToDisplayAmount(g.target_amount, tk.decimals) : g.target_amount);
          setLiveTargetRaw(g.target_amount);
        } else {
          setTokenContract(resolvedTokens[0]?.contract_address ?? "");
          setTargetDisplay("");
          setLiveTargetRaw("0");
        }
      })
      .catch(() => {
        // Network error: keep defaults; the user can still save.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [handle, hasTokensProp, tokensProp]);

  if (!handle) return null;

  const selectedToken = tokens.find((t) => t.contract_address === tokenContract) ?? null;
  const decimals = selectedToken?.decimals ?? 0;

  const currentRaw = goal?.current ?? "0";
  const pct = computePct(currentRaw, liveTargetRaw);

  async function save() {
    if (!handle) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const raw = displayToRawAmount(targetDisplay, decimals);
      const res = await fetch(
        `/api/creators/${encodeURIComponent(handle)}/goal`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_amount: raw, token: tokenContract }),
        },
      );
      if (res.status === 200) {
        const body = (await res.json()) as { target_amount: number | string; token: string };
        const rawTarget = String(body.target_amount);
        setLiveTargetRaw(rawTarget);
        const tk = tokens.find((t) => t.contract_address === body.token);
        setTargetDisplay(tk ? rawToDisplayAmount(rawTarget, tk.decimals) : rawTarget);
        setStatus({
          kind: "success",
          message: rawTarget === "0" ? "Donation goal cleared." : "Donation goal saved.",
        });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({
          kind: "error",
          message: goalErrorMessage(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not save the donation goal." });
    } finally {
      setSaving(false);
    }
  }

  async function clearGoal() {
    if (!handle) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch(
        `/api/creators/${encodeURIComponent(handle)}/goal`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_amount: 0, token: tokenContract }),
        },
      );
      if (res.status === 200) {
        setTargetDisplay("");
        setLiveTargetRaw("0");
        setStatus({ kind: "success", message: "Donation goal cleared." });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({ kind: "error", message: goalErrorMessage(body.error) });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not clear the donation goal." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donation goal"
          info={
            <>
              Set a target amount for your supporters to see on your public
              profile. Progress reflects only confirmed donations in the
              goal&apos;s token. Set the target to 0 or use Clear to remove the
              goal.
            </>
          }
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4" data-testid="donation-goal-card">
        {goal ? (
          <div className="flex flex-col gap-2" data-testid="donation-goal-progress">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span
                className="font-mono text-sm text-foreground"
                data-testid="donation-goal-pct"
              >
                {pct}%
              </span>
            </div>
            <div
              aria-hidden
              className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/8"
            >
              <div
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary/70 transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${pct / 100})` }}
                data-testid="donation-goal-bar"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span data-testid="donation-goal-current">
                {rawToDisplayAmount(currentRaw, decimals)}
              </span>
              <span data-testid="donation-goal-target">
                of {rawToDisplayAmount(liveTargetRaw, decimals)} {selectedToken?.symbol ?? ""}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="donation-goal-empty">
            No goal set. Pick a token and a target below to show progress on your profile.
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="donation-goal-target-input"
          >
            Target amount
          </label>
          <Input
            id="donation-goal-target-input"
            type="number"
            min={0}
            step="0.01"
            className="max-w-[12rem]"
            value={targetDisplay}
            disabled={loading || saving}
            onChange={(e) => {
              setTargetDisplay(e.target.value);
              setLiveTargetRaw(displayToRawAmount(e.target.value, decimals));
            }}
            data-testid="donation-goal-target-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="donation-goal-token-select"
          >
            Token
          </label>
          <select
            id="donation-goal-token-select"
            className="max-w-[12rem] rounded-md border border-foreground/10 bg-background px-3 py-2 text-sm"
            value={tokenContract}
            disabled={loading || saving || tokens.length === 0}
            onChange={(e) => {
              setTokenContract(e.target.value);
              const tk = tokens.find((t) => t.contract_address === e.target.value);
              setLiveTargetRaw(displayToRawAmount(targetDisplay, tk?.decimals ?? 0));
            }}
            data-testid="donation-goal-token-select"
          >
            {tokens.length === 0 && <option value="">No tokens</option>}
            {tokens.map((t) => (
              <option key={t.contract_address} value={t.contract_address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={save}
            loading={saving}
            disabled={loading || saving || !tokenContract}
            data-testid="donation-goal-save"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearGoal}
            loading={saving}
            disabled={loading || saving || !goal}
            data-testid="donation-goal-clear"
          >
            Clear
          </Button>
        </div>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}
