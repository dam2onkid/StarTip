/**
 * Pure, client-safe helpers for the Creator donate QR code.
 *
 * `buildDonateUrl` is the single source of truth for the absolute
 * `/creator/[handle]/donate` URL that a QR code encodes. It is shared by the
 * dashboard QR card (`creator-tab.tsx`) and the public Creator profile QR
 * (`creator/[handle]/page.tsx`) so both surfaces encode byte-identical URLs.
 *
 * The module has no `server-only` marker and imports only `URL` (a web
 * standard available in both Node and the browser), so it is safe to import
 * from client components, server components, and tests alike.
 */

/**
 * Build the absolute donate URL for a Creator handle.
 *
 * The handle is trimmed and lowercased before being placed in the path,
 * matching the canonical Handle rules (`handle-shared.ts`) and the
 * `/creator/[handle]` routing. The origin is used as the base for `URL`; a
 * root-relative URL (`/creator/[handle]/donate`) is returned when the origin
 * is empty, which lets client components render a placeholder on SSR and
 * repaint with the absolute URL once `window.location.origin` is known.
 *
 * @param handle The Creator handle (case-insensitive, whitespace-trimmed).
 * @param origin The absolute origin, e.g. `https://startip.app`. May be empty.
 * @returns The absolute donate URL, or a root-relative URL when origin is empty.
 */
export function buildDonateUrl(handle: string, origin: string): string {
  const normalized = handle.trim().toLowerCase();
  const path = `/creator/${normalized}/donate`;
  if (!origin) return path;
  return new URL(path, origin).toString();
}
