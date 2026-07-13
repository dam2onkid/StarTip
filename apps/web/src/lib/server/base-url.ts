import "server-only";
import { headers } from "next/headers";

/**
 * Resolve the absolute base URL for the current request so a Server Component
 * can call an internal App Router API route with `fetch`. Falls back to
 * `http://localhost:3000` when the request headers are not available.
 */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
