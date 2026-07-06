"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  shouldShowAlert,
  alertDurationMs,
  type OverlaySettings,
} from "@/lib/overlay/settings";
import { rawToDisplayAmount } from "@/lib/stellar/amount";

/**
 * Overlay client component. Renders donation alerts (Donor Name, amount +
 * token symbol, message) with enter animation and subscribes to Supabase
 * Realtime on `donations` so new confirmed/indexed visible donations appear
 * live without a page reload.
 *
 * Overlay settings (spec §11.3) are passed from the server component:
 *   * `alert_duration_ms` — each alert auto-dismisses after this many ms
 *     (default 6000). The `MAX_ALERTS = 5` cap remains as a safety bound.
 *   * `min_amount` (in raw units, resolved by the server using the token
 *     decimals) — donations below this threshold are silently recorded but
 *     not shown. {@link shouldShowAlert} applies the filter to both the
 *     initial donations and Realtime inserts.
 *   * `sound_enabled` — a short alert sound plays on Realtime insert when
 *     true (no sound on the initial server-rendered donations). The browser
 *     may block autoplay until a user interaction; the Overlay is a browser
 *     source so OBS provides the interaction context.
 *
 * Realtime subscription: the anon-key browser client opens a
 * `postgres_changes` channel filtered by `creator_profile_id`. The
 * `donations_anon_visible_select` RLS policy restricts the channel to rows
 * with `status IN ('confirmed','indexed') AND moderation_status = 'visible'`,
 * so hidden donations are suppressed on the wire (the client never receives
 * them). The initial donations passed from the server component are already
 * filtered the same way.
 *
 * Token symbol + decimals resolution: `donations.token` stores the token
 * contract address (per the confirm path) and `donations.amount` stores the
 * raw i128 amount in the smallest divisible unit (`10^decimals` per display
 * unit, e.g. 90000000 raw = 9 XLM at 7 decimals). The server passes the token
 * allowlist (`contract_address` -> `symbol`, `decimals`); the client maps each
 * donation's token to its symbol (falling back to the raw `token` string when
 * no allowlist entry matches, e.g. the mock stores the symbol directly) and to
 * its `decimals`, then converts the raw `amount` to a human-readable display
 * string via `rawToDisplayAmount`. A token with no allowlist entry (or no
 * `decimals`) falls back to `decimals = 0`, which renders the raw amount
 * unchanged.
 *
 * Test seam: when `window.__STARTIP_OVERLAY_REALTIME_STUB__` is present
 * (injected by the Playwright E2E harness), the hook registers the insert
 * callback with the stub instead of opening a Realtime channel. This lets
 * E2E push a new donation deterministically without a WebSocket, mirroring
 * the creator-tab Realtime stub pattern.
 */

export interface OverlayDonation {
  id: string;
  donor_name: string;
  amount: string;
  token: string;
  message: string | null;
  created_at: string;
}

export interface OverlayToken {
  contract_address: string;
  symbol: string;
  /** Token decimals (used by the server to convert min_amount to raw units). */
  decimals?: number;
}

export interface OverlayRealtimeStub {
  subscribe(onInsert: (row: OverlayDonation) => void): () => void;
}

declare global {
  interface Window {
    __STARTIP_OVERLAY_REALTIME_STUB__?: OverlayRealtimeStub;
  }
}

/** Maximum number of alerts kept on screen at once (oldest dropped first). */
const MAX_ALERTS = 5;

/** Path to the bundled alert sound in /public. */
const ALERT_SOUND_URL = "/alert.mp3";

/** Stable default settings so `settings ?? DEFAULTS_SETTINGS` is referentially stable. */
const DEFAULT_SETTINGS: OverlaySettings = {};

export function OverlayAlerts({
  creatorProfileId,
  initialDonations,
  tokenAllowlist,
  settings,
}: {
  creatorProfileId: string;
  initialDonations: OverlayDonation[];
  tokenAllowlist: OverlayToken[];
  /** Overlay settings from the server. Defaults apply when omitted. */
  settings?: OverlaySettings;
}) {
  const resolvedSettings = settings ?? DEFAULT_SETTINGS;
  const durationMs = React.useMemo(() => alertDurationMs(resolvedSettings), [resolvedSettings]);
  const soundEnabled = resolvedSettings.soundEnabled !== false;

  // Apply the min_amount filter to the initial server-rendered donations.
  const seeded = React.useMemo(
    () => initialDonations.filter((d) => shouldShowAlert(d, resolvedSettings)),
    [initialDonations, resolvedSettings],
  );
  const [alerts, setAlerts] = React.useState<OverlayDonation[]>(seeded);

  // Re-seed when the server snapshot changes (e.g. settings updated). The
  // `seeded` array is memoized, so this only runs when the initial donations
  // or settings actually change. Adjusting state during render (storing the
  // previous `seeded` reference and calling setAlerts when it changes) is the
  // React-recommended replacement for the `useEffect(() => setAlerts(seeded))`
  // anti-pattern: React re-renders synchronously before commit instead of
  // cascading an effect-driven update after commit.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSeeded, setPrevSeeded] = React.useState(seeded);
  if (seeded !== prevSeeded) {
    setPrevSeeded(seeded);
    setAlerts(seeded);
  }

  const symbolByContract = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tokenAllowlist) map.set(t.contract_address, t.symbol);
    return map;
  }, [tokenAllowlist]);

  const decimalsByContract = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tokenAllowlist) {
      if (typeof t.decimals === "number") map.set(t.contract_address, t.decimals);
    }
    return map;
  }, [tokenAllowlist]);

  const removeAlert = React.useCallback((id: string) => {
    setAlerts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const appendAlert = React.useCallback(
    (row: OverlayDonation) => {
      // Suppress donations below min_amount (in raw units).
      if (!shouldShowAlert(row, resolvedSettings)) return;
      setAlerts((prev) => {
        // Drop the oldest when the cap is reached, then append the new alert.
        const next = prev.length >= MAX_ALERTS ? prev.slice(prev.length - MAX_ALERTS + 1) : prev.slice();
        // De-duplicate by id (Realtime may re-deliver).
        if (next.some((d) => d.id === row.id)) return prev;
        next.push(row);
        return next;
      });
      // Play the alert sound on Realtime insert when enabled. No sound on the
      // initial server-rendered donations (those are not "inserts").
      if (soundEnabled) playAlertSound();
    },
    [resolvedSettings, soundEnabled],
  );

  useOverlayRealtime(creatorProfileId, appendAlert);

  return (
    <div
      data-testid="overlay-alerts"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-0 flex flex-col-reverse gap-3 px-6 py-6"
    >
      <AnimatePresence initial={false}>
        {alerts.map((d) => (
          <AlertCard
            key={d.id}
            donation={d}
            symbol={symbolByContract.get(d.token) ?? d.token}
            decimals={decimalsByContract.get(d.token) ?? 0}
            durationMs={durationMs}
            onExpire={removeAlert}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AlertCard({
  donation,
  symbol,
  decimals,
  durationMs,
  onExpire,
}: {
  donation: OverlayDonation;
  symbol: string;
  decimals: number;
  durationMs: number;
  onExpire: (id: string) => void;
}) {
  // Honor prefers-reduced-motion: collapse the slide to a pure fade so the
  // overlay still signals new donations without lateral motion.
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, x: -48 };
  const rest = reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 };

  // Auto-dismiss: start a timer on mount, remove the alert on expiry. Cleared
  // on unmount so a dropped alert (cap reached, parent re-seed) does not fire
  // a stale removal. `prefers-reduced-motion` does not disable the timer (it
  // only affects the animation).
  React.useEffect(() => {
    const id = window.setTimeout(() => onExpire(donation.id), durationMs);
    return () => window.clearTimeout(id);
  }, [donation.id, durationMs, onExpire]);

  return (
    <motion.div
      data-testid="overlay-alert"
      layout
      initial={enter}
      animate={rest}
      exit={enter}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="pointer-events-auto w-full max-w-sm rounded-lg bg-card/80 p-4 ring-1 ring-foreground/10 backdrop-blur-md"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          data-testid="alert-donor-name"
          className="min-w-0 truncate font-display text-lg font-semibold text-foreground"
        >
          {donation.donor_name}
        </span>
        <span className="flex shrink-0 items-baseline font-mono text-sm tabular-nums">
          <span data-testid="alert-amount" className="text-primary">
            {rawToDisplayAmount(donation.amount, decimals)}
          </span>
          <span data-testid="alert-symbol" className="ml-1 text-muted-foreground">
            {symbol}
          </span>
        </span>
      </div>
      {donation.message ? (
        <p
          data-testid="alert-message"
          className="mt-1 break-words text-sm text-muted-foreground"
        >
          {donation.message}
        </p>
      ) : null}
    </motion.div>
  );
}

/**
 * Play the bundled alert sound. Swallows autoplay errors: the Overlay is a
 * browser source and the browser may block `play()` until a user interaction
 * (OBS provides the interaction context in production). Exposed for test
 * spying via the `Audio` global.
 */
function playAlertSound(): void {
  if (typeof Audio === "undefined") return;
  try {
    const audio = new Audio(ALERT_SOUND_URL);
    audio.volume = 0.8;
    void audio.play().catch(() => {
      // Autoplay blocked or decode error: silent. The alert still renders.
    });
  } catch {
    // `new Audio` or `play` threw: silent.
  }
}

/**
 * Subscribe to Supabase Realtime on `donations` for the given Creator. Only
 * `INSERT` events are handled (new donations). The RLS policy restricts the
 * channel to visible confirmed/indexed rows, so the filter only needs
 * `creator_profile_id`.
 *
 * Test seam: when `window.__STARTIP_OVERLAY_REALTIME_STUB__` is present, the
 * hook registers `onInsert` with the stub instead of opening a channel.
 */
function useOverlayRealtime(creatorProfileId: string, onInsert: (row: OverlayDonation) => void) {
  const onInsertRef = React.useRef(onInsert);
  React.useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);
  React.useEffect(() => {
    const stub = typeof window !== "undefined" ? window.__STARTIP_OVERLAY_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((row) => onInsertRef.current(row));
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`overlay-donations:${creatorProfileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "donations",
          filter: `creator_profile_id=eq.${creatorProfileId}`,
        },
        (payload) => {
          const row = payload.new as OverlayDonation;
          onInsertRef.current(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [creatorProfileId]);
}
