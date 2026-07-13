import { randomUUID } from "crypto";

/**
 * Generate an opaque, unguessable Overlay ID. A fresh ID is a UUID v4 without
 * hyphens so it is URL-safe and avoids accidental stream leaks. The generator
 * is shared between the Web app (regenerate action) and the Worker/indexer
 * paths that flip a Creator to active.
 */
export function generateOverlayId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Return the existing Overlay ID on a profile, or generate a new one if it is
 * missing. Used when onboarding completes so the same code path generates the
 * ID in the dashboard reconcile route and the indexer worker.
 */
export function ensureOverlayId(profile: { overlay_id?: string | null }): string {
  return profile.overlay_id ?? generateOverlayId();
}
