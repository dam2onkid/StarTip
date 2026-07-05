"use client";

import * as React from "react";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function getSnapshot(): boolean {
  return window.matchMedia(REDUCE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  // SSR and the initial hydration render use `false` so the server-rendered
  // HTML and the first client paint match (no hydration mismatch). React then
  // re-renders with the real OS value from `getSnapshot`.
  return false;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * SSR-safe subscription to the user's `prefers-reduced-motion` setting via
 * `useSyncExternalStore`.
 *
 * Returns `false` during SSR and the initial hydration render (to keep the
 * server-rendered HTML and the first paint consistent), then resolves to the
 * real OS value on the next client render. The motion layer gates Framer
 * Motion reveals and Lenis smooth scrolling on this hook: when the user has
 * set `reduce`, the landing page renders statically and scrolls natively (per
 * `premium-frontend-ui` skill §5 accessibility guardrail and PRD user story
 * 34).
 */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}
