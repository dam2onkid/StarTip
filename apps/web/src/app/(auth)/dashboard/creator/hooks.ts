"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CreatorProfile } from "./types";

/**
 * Subscribe to Supabase Realtime on the caller's profile row and invoke the
 * callback when `onchain_registered` flips to true. The subscription is scoped
 * to the profile id and cleaned up on unmount / profile change.
 *
 * Test seam: when `window.__STARTIP_REALTIME_STUB__` is present (injected by
 * the Playwright E2E harness), the hook registers the callback with the stub
 * instead of opening a Realtime channel. This lets E2E drive the
 * `onchain_pending → active` flip deterministically without a WebSocket.
 */
export function useOnchainRegisteredRealtime(
  profile: CreatorProfile,
  onActive: (next: Partial<CreatorProfile>) => void,
) {
  const onActiveRef = useRef(onActive);
  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  useEffect(() => {
    if (profile.onchain_registered) return; // already active, no need to listen

    const stub =
      typeof window !== "undefined" ? window.__STARTIP_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((next) => onActiveRef.current(next));
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`profiles:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const next = payload.new as {
            onchain_registered?: boolean;
            payout_address?: string | null;
          };
          if (next.onchain_registered) {
            onActiveRef.current({
              payout_address: next.payout_address ?? undefined,
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.onchain_registered]);
}

/**
 * Subscribe to Supabase Realtime on the caller's profile row and invoke the
 * callback when the indexer mirrors a `payout_address` or `paused` change
 * (from `update_creator_payout` / `set_creator_active_owner`). Only attaches
 * once the Creator is on-chain registered (the active panel).
 *
 * Test seam: when `window.__STARTIP_REALTIME_STUB__` is present, the hook
 * registers the callback with the stub so E2E can push the
 * `payout_address` / `paused` flip deterministically without a WebSocket.
 */
export function useCreatorActiveRealtime(
  profile: CreatorProfile,
  onUpdate: (next: Partial<CreatorProfile>) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!profile.onchain_registered) return; // only active Creators need this

    const stub =
      typeof window !== "undefined" ? window.__STARTIP_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((next) => onUpdateRef.current(next));
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`profiles-active:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const next = payload.new as {
            payout_address?: string | null;
            paused?: boolean;
          };
          const update: Partial<CreatorProfile> = {};
          if (next.payout_address !== undefined) {
            update.payout_address = next.payout_address;
          }
          if (next.paused !== undefined) {
            update.paused = next.paused;
          }
          if (Object.keys(update).length > 0) {
            onUpdateRef.current(update);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.onchain_registered]);
}
