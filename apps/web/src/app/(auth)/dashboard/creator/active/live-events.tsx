"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardTitleWithInfo } from "../shared";
import { StatusToast, liveEventsErrorMessage } from "../utils";
import type { Status } from "../types";

const EFFECT_IDS = [
  { id: "screen-flash", label: "Screen Flash" },
  { id: "jump-scare", label: "Jump Scare" },
  { id: "tunnel-vision", label: "Tunnel Vision" },
  { id: "screen-cover", label: "Screen Cover" },
] as const;

type EffectPrices = Record<string, string>;

interface LiveEventsApiResponse {
  live_events_enabled: boolean;
  effects: Record<string, { name: string; price: number }>;
}

function pricesFromResponse(data: LiveEventsApiResponse): EffectPrices {
  const result: EffectPrices = {};
  for (const { id } of EFFECT_IDS) {
    result[id] = String(data.effects[id]?.price ?? "");
  }
  return result;
}

/**
 * Live Events settings card: let the owning Creator opt into Live Events and
 * edit the four Default Pack Effect Prices. Effect intensity, duration,
 * geometry, cooldown, media, volume, pack management, and other out-of-scope
 * controls are deliberately not exposed.
 */
export function LiveEventsSettingsCard({ handle }: { handle: string | null | undefined }) {
  const [enabled, setEnabled] = useState(false);
  const [prices, setPrices] = useState<EffectPrices>({
    "screen-flash": "1",
    "jump-scare": "2",
    "tunnel-vision": "3",
    "screen-cover": "5",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!handle) return;
    let alive = true;

    fetch(`/api/creators/${encodeURIComponent(handle)}/live-events`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as LiveEventsApiResponse;
        if (!alive) return;
        setEnabled(data.live_events_enabled);
        setPrices(pricesFromResponse(data));
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
  }, [handle]);

  if (!handle) return null;

  async function save() {
    if (!handle) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const parsedPrices: Record<string, number> = {};
      for (const { id } of EFFECT_IDS) {
        const num = Number(prices[id]);
        if (!Number.isFinite(num) || num < 0) {
          setStatus({ kind: "error", message: "Each price must be a non-negative number." });
          return;
        }
        parsedPrices[id] = num;
      }

      const res = await fetch(`/api/creators/${encodeURIComponent(handle)}/live-events`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ live_events_enabled: enabled, prices: parsedPrices }),
      });

      if (res.status === 200) {
        const body = (await res.json()) as { live_events_enabled: boolean; prices: Record<string, number> };
        setEnabled(body.live_events_enabled);
        setPrices(
          Object.fromEntries(
            Object.entries(body.prices).map(([id, price]) => [id, String(price)]),
          ) as EffectPrices,
        );
        setStatus({ kind: "success", message: "Live Events settings saved." });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({
          kind: "error",
          message: liveEventsErrorMessage(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not save Live Events settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Live Events"
          info="Opt in to let donors trigger Donation Effects and set the minimum donation for each Default Pack effect."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4" data-testid="live-events-settings-card">
        <div className="flex items-center gap-2">
          <input
            id="live-events-enabled-toggle"
            type="checkbox"
            className="h-4 w-4 rounded border-foreground/20 accent-primary"
            checked={enabled}
            disabled={loading || saving}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="live-events-enabled-toggle"
          />
          <label
            className="text-xs text-muted-foreground"
            htmlFor="live-events-enabled-toggle"
          >
            Enable Live Events and effect choices on my donate page
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EFFECT_IDS.map(({ id, label }) => (
            <div key={id} className="flex flex-col gap-1">
              <label
                className="text-xs text-muted-foreground"
                htmlFor={`live-events-price-${id}`}
              >
                {label} minimum (test USDC)
              </label>
              <Input
                id={`live-events-price-${id}`}
                type="number"
                min={0.1}
                step="0.01"
                className="max-w-[12rem]"
                value={prices[id]}
                disabled={loading || saving}
                onChange={(e) => setPrices((prev) => ({ ...prev, [id]: e.target.value }))}
                data-testid={`live-events-price-${id}`}
              />
            </div>
          ))}
        </div>

        <p className="text-[0.65rem] text-muted-foreground/70">
          Prices below 0.10 test USDC are rejected. The full donation still goes
          to the creator; the price is only a minimum, never a separate fee.
        </p>

        <Button
          type="button"
          size="sm"
          onClick={save}
          loading={saving}
          disabled={loading || saving}
          className="self-start"
          data-testid="live-events-settings-save"
        >
          Save
        </Button>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}
