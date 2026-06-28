import { notImplemented } from "@/app/api/_not-implemented";
import type { NextRequest } from "next/server";

/** GET /api/creators/[handle] — public Creator profile. */
export async function GET(_request: NextRequest, _context: { params: Promise<{ handle: string }> }) {
  return notImplemented();
}
