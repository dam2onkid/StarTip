import { describe, it } from "vitest";

/**
 * API route stub contract tests used to live here. The individual route
 * handlers now have dedicated test files covering their real contracts:
 *
 *   - POST /api/creators              -> app/api/creators/route.test.ts
 *   - GET  /api/creators/[handle]     -> app/api/creators/[handle]/route.test.ts
 *   - POST /api/wallet/link/challenge -> app/api/wallet/link/challenge/route.test.ts
 *   - POST /api/wallet/link           -> app/api/wallet/link/route.test.ts
 *   - POST /api/donations/verify      -> apps/worker/src/server.test.ts (proxied)
 *   - POST /api/indexer/poll          -> app/api/indexer/poll/route.test.ts
 *
 * This file is kept as an index placeholder so the test suite still documents
 * where each route's contract lives.
 */
describe("api route contracts", () => {
  it("contracts are covered by per-route test files", () => {
    // See the file header for the mapping. No assertions needed here.
  });
});
