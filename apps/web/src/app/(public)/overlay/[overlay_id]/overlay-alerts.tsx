"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  shouldShowAlert,
  alertDurationMs,
  type OverlaySettings,
  type OverlayToken,
} from "@/lib/overlay/settings";
import { rawToDisplayAmount } from "@/lib/stellar/amount";

/**
 * Overlay client component. Renders donation alerts (Donor Name, amount +
 * token symbol, message) with enter animation and subscribes to Supabase
 * Realtime on `donations` so new confirmed/indexed visible donations appear
 * live without a page reload.
 *
 * Overlay settings (spec §11.3) are passed from the server component:
 *   * `alert_duration_ms` - each queued alert auto-dismisses after this many
 *     ms (default 10000).
 *   * `min_amount` (in raw units, resolved by the server using the token
 *     decimals) - donations below this threshold are silently recorded but
 *     not shown. {@link shouldShowAlert} applies the filter to both the
 *     initial donations and Realtime inserts.
 *   * `sound_enabled` - a short alert sound plays on Realtime insert when
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

export interface OverlayRealtimeStub {
  subscribe(onInsert: (row: OverlayDonation) => void): () => void;
}

declare global {
  interface Window {
    __STARTIP_OVERLAY_REALTIME_STUB__?: OverlayRealtimeStub;
  }
}

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
  const [queue, setQueue] = React.useState<OverlayDonation[]>(seeded);

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
    setQueue(seeded);
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
    setQueue((prev) => (prev[0]?.id === id ? prev.slice(1) : prev));
  }, []);

  const updateQueuedAlert = React.useCallback((row: OverlayDonation) => {
    if (!shouldShowAlert(row, resolvedSettings)) return;
    setQueue((prev) => {
      const index = prev.findIndex((d) => d.id === row.id);
      if (index === -1) return [...prev, row];
      const next = prev.slice();
      next[index] = row;
      return next;
    });
  }, [resolvedSettings]);

  const appendAlert = React.useCallback(
    (row: OverlayDonation) => {
      // Suppress donations below min_amount (in raw units).
      if (!shouldShowAlert(row, resolvedSettings)) return;
      setQueue((prev) => {
        // De-duplicate by id (Realtime may re-deliver).
        if (prev.some((d) => d.id === row.id)) return prev;
        return [...prev, row];
      });
      // Play the alert sound on Realtime insert when enabled. No sound on the
      // initial server-rendered donations (those are not "inserts").
      if (soundEnabled) playAlertSound();
    },
    [resolvedSettings, soundEnabled],
  );

  useOverlayRealtime(creatorProfileId, appendAlert, updateQueuedAlert);

  const currentAlert = queue[0] ?? null;

  return (
    <div
      data-testid="overlay-alerts"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-0 flex items-center justify-center px-6 py-6"
    >
      <AnimatePresence initial={false}>
        {currentAlert ? (
          <AlertCard
            key={currentAlert.id}
            donation={currentAlert}
            symbol={symbolByContract.get(currentAlert.token) ?? currentAlert.token}
            decimals={decimalsByContract.get(currentAlert.token) ?? 0}
            durationMs={durationMs}
            onExpire={removeAlert}
          />
        ) : null}
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

  const amount = rawToDisplayAmount(donation.amount, decimals);

  return (
    <motion.div
      data-testid="overlay-alert"
      initial={enter}
      animate={rest}
      exit={enter}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="pointer-events-auto w-full max-w-xl rounded-lg bg-card/85 p-7 ring-1 ring-foreground/10 backdrop-blur-md"
    >
      <p className="break-words font-display text-[1.625rem] font-semibold leading-tight text-foreground">
        <span
          data-testid="alert-donor-name"
          className="text-primary"
        >
          {donation.donor_name}
        </span>
        {" donated "}
        <span className="font-mono text-[1.45rem] tabular-nums text-primary">
          <span data-testid="alert-amount">{amount}</span>
          <span data-testid="alert-symbol" className="ml-1">
            {symbol}
          </span>
        </span>
      </p>
      {donation.message ? (
        <p
          data-testid="alert-message"
          className="mt-3 break-words text-[1.3rem] leading-snug text-muted-foreground"
        >
          &quot;{donation.message}&quot;
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
 * Subscribe to Supabase Realtime on `donations` for the given Creator.
 * `INSERT` enqueues new donations; `UPDATE` refreshes an existing queued alert
 * when the verify path enriches an indexer-created row with donor content.
 * The RLS policy restricts the channel to visible confirmed/indexed rows, so
 * the filter only needs `creator_profile_id`.
 *
 * Test seam: when `window.__STARTIP_OVERLAY_REALTIME_STUB__` is present, the
 * hook registers `onInsert` with the stub instead of opening a channel.
 */
function useOverlayRealtime(
  creatorProfileId: string,
  onInsert: (row: OverlayDonation) => void,
  onUpdate: (row: OverlayDonation) => void,
) {
  const onInsertRef = React.useRef(onInsert);
  const onUpdateRef = React.useRef(onUpdate);
  React.useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
  }, [onInsert, onUpdate]);
  React.useEffect(() => {
    const stub = typeof window !== "undefined" ? window.__STARTIP_OVERLAY_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((row) => {
        const normalized = normalizeRealtimeDonation(row);
        if (normalized) onInsertRef.current(normalized);
      });
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
          const row = normalizeRealtimeDonation(payload.new);
          if (row) onInsertRef.current(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "donations",
          filter: `creator_profile_id=eq.${creatorProfileId}`,
        },
        (payload) => {
          const row = normalizeRealtimeDonation(payload.new);
          if (row) onUpdateRef.current(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [creatorProfileId]);
}

function normalizeRealtimeDonation(row: unknown): OverlayDonation | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const token = typeof r.token === "string" ? r.token : "";
  const rawAmount =
    typeof r.amount === "string" || typeof r.amount === "number" || typeof r.amount === "bigint"
      ? String(r.amount)
      : "";

  if (!id || !token || !isIntegerString(rawAmount)) return null;

  const donorName = typeof r.donor_name === "string" && r.donor_name.trim() ? r.donor_name : "Anonymous";
  const message = typeof r.message === "string" && r.message.trim() ? r.message : null;
  const createdAt = typeof r.created_at === "string" ? r.created_at : "";

  return {
    id,
    donor_name: donorName,
    amount: rawAmount,
    token,
    message,
    created_at: createdAt,
  };
}

function isIntegerString(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}
