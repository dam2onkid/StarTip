import { NextResponse } from "next/server";

/**
 * Standard 501 response for API route stubs. Locks the route contract shape
 * without implementing behavior; subsequent feature PRDs replace these
 * handlers with real implementations.
 */
export function notImplemented() {
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
