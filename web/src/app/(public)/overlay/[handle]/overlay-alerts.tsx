"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Overlay client component. Renders donation alerts (Donor Name, amount +
 * token symbol, message) with enter animation and subscribes to Supabase
 * Realtime on `donations` so new confirmed/indexed visible donations appear
 * live without a page reload.
 *
 * Realtime subscription: the anon-key browser client opens a
 * `postgres_changes` channel filtered by `creator_profile_id`. The
 * `donations_anon_visible_select` RLS policy restricts the channel to rows
 * with `status IN ('confirmed','indexed') AND moderation_status = 'visible'`,
 * so hidden donations are suppressed on the wire (the client never receives
 * them). The initial donations passed from the server component are already
 * filtered the same way.
 *
 * Token symbol resolution: `donations.token` stores the token contract
 * address (per the confirm path). The server passes the token allowlist
 * (`contract_address` -> `symbol`); the client maps each donation's token to
 * its symbol, falling back to the raw `token` string when no allowlist entry
 * matches (e.g. the mock stores the symbol directly).
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

export function OverlayAlerts({
  creatorProfileId,
  initialDonations,
  tokenAllowlist,
}: {
  creatorProfileId: string;
  initialDonations: OverlayDonation[];
  tokenAllowlist: OverlayToken[];
}) {
  const [alerts, setAlerts] = React.useState<OverlayDonation[]>(initialDonations);

  const symbolByContract = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tokenAllowlist) map.set(t.contract_address, t.symbol);
    return map;
  }, [tokenAllowlist]);

  const appendAlert = React.useCallback((row: OverlayDonation) => {
    setAlerts((prev) => {
      // Drop the oldest when the cap is reached, then append the new alert.
      const next = prev.length >= MAX_ALERTS ? prev.slice(prev.length - MAX_ALERTS + 1) : prev.slice();
      // De-duplicate by id (Realtime may re-deliver).
      if (next.some((d) => d.id === row.id)) return prev;
      next.push(row);
      return next;
    });
  }, []);

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
          <AlertCard key={d.id} donation={d} symbol={symbolByContract.get(d.token) ?? d.token} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AlertCard({
  donation,
  symbol,
}: {
  donation: OverlayDonation;
  symbol: string;
}) {
  // Honor prefers-reduced-motion: collapse the slide to a pure fade so the
  // overlay still signals new donations without lateral motion.
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, x: -48 };
  const rest = reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 };

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
            {donation.amount}
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
