// Mock Supabase Auth HTTP server for Playwright E2E.
//
// The StarTip web app points `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` at
// this server during E2E runs. It implements the subset of the Supabase Auth
// REST surface that the login -> callback -> dashboard -> logout flow needs:
//
//   POST /auth/v1/otp            -> magic link "sent"
//   POST /auth/v1/token          -> session (PKCE exchange + refresh)
//   GET  /auth/v1/user           -> the stub user (Bearer access_token)
//   POST /auth/v1/logout         -> 204
//
// The access token is a fake JWT (unsigned, far-future exp). supabase-js does
// not verify the signature client-side; it only decodes claims for expiry.
// The mock does not verify the token either, so any Bearer token returns the
// stub user. This is intentionally a stub, not a security boundary.

import { createServer } from "node:http";

const STUB_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "fan@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
};

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fakeAccessToken() {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: STUB_USER.id,
      aud: "authenticated",
      role: "authenticated",
      email: STUB_USER.email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${header}.${payload}.stub-signature`;
}

const SESSION = {
  access_token: fakeAccessToken(),
  refresh_token: "stub-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  user: STUB_USER,
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function json(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

export function startMockSupabase(port) {
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      cors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = url.pathname;
    const query = url.searchParams;

    // Magic link request.
    if (req.method === "POST" && path === "/auth/v1/otp") {
      json(res, 200, {});
      return;
    }

    // PKCE code exchange or token refresh.
    if (req.method === "POST" && path === "/auth/v1/token") {
      json(res, 200, SESSION);
      return;
    }

    // Current user (Bearer access_token).
    if (req.method === "GET" && path === "/auth/v1/user") {
      json(res, 200, STUB_USER);
      return;
    }

    // Logout.
    if (req.method === "POST" && path === "/auth/v1/logout") {
      json(res, 200, {});
      return;
    }

    // Anything else: return an empty 200 so unrelated SDK pings do not fail.
    json(res, 200, {});
    void query;
    void readBody;
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
