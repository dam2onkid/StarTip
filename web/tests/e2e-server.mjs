// Boots the mock Supabase Auth server and `next dev` together for Playwright
// E2E. The mock URL is injected into process.env BEFORE next dev starts so
// Next.js does not override it with .env values (Next.js does not override
// already-set process.env vars) and so NEXT_PUBLIC_* values are baked into the
// client bundle at compile time.

import { spawn } from "node:child_process";
import { startMockSupabase } from "./fixtures/mock-supabase.mjs";

const MOCK_PORT = 5499;
const APP_PORT = 3100;

const mock = await startMockSupabase(MOCK_PORT);
console.log(`[e2e] mock supabase on http://127.0.0.1:${MOCK_PORT}`);

process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${MOCK_PORT}`;
process.env.SUPABASE_URL = `http://127.0.0.1:${MOCK_PORT}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID = "test-contract";
process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
process.env.NEXT_PUBLIC_LENIS_DISABLED = "true";

const next = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "--port", String(APP_PORT)],
  { stdio: "inherit", env: process.env },
);

function shutdown(code) {
  mock.close();
  process.exit(code ?? 0);
}

next.on("exit", shutdown);
process.on("SIGINT", () => next.kill("SIGINT"));
process.on("SIGTERM", () => next.kill("SIGTERM"));
