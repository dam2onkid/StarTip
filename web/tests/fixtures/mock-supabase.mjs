// Mock Supabase Auth + PostgREST server for Playwright E2E.
//
// The StarTip web app points `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` at
// this server during E2E runs. It implements the subset of the Supabase surface
// that the login -> callback -> dashboard -> onboarding -> donate ->
// explore -> creator page flow needs:
//
//   POST /auth/v1/otp            -> magic link "sent"
//   POST /auth/v1/token          -> session (PKCE exchange + refresh)
//   GET  /auth/v1/user           -> the stub user (Bearer access_token)
//   POST /auth/v1/logout         -> 204
//   GET  /rest/v1/profiles       -> the stub profile (dashboard) OR a public
//                                   creator when queried by `handle=eq.<h>`
//   PATCH /rest/v1/profiles      -> 200 (service-role writes; shape echoed)
//   GET  /rest/v1/public_profiles-> the list of registered, not-paused creators
//   GET  /rest/v1/donations      -> confirmed/indexed visible donations
//                                   (filtered by creator_profile_id when present)
//   GET  /rest/v1/tokens         -> the stub token allowlist (PostgREST array)
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

// A fixed registered, not-paused Creator the public discovery pages read. The
// donations below reference its id as `creator_profile_id`.
const PUBLIC_CREATOR = {
  id: "00000000-0000-0000-0000-0000000000c1",
  user_id: "00000000-0000-0000-0000-000000000002",
  handle: "ada",
  display_name: "Ada Lovelace",
  avatar_url: null,
  bio: "Pioneer programmer.",
  onchain_registered: true,
  paused: false,
};

const PUBLIC_CREATORS = [PUBLIC_CREATOR];

// Confirmed, visible donations for the Creator. The first two are logged-in
// donors (user_id set) and contribute to the leaderboard; the third is
// anonymous (user_id null) and is excluded from the leaderboard but still
// counts toward the Creator's total received + donation count.
const DONATIONS = [
  {
    donor_name: "Ada",
    amount: "100",
    user_id: "00000000-0000-0000-0000-000000000010",
    creator_profile_id: PUBLIC_CREATOR.id,
  },
  {
    donor_name: "Bob",
    amount: "500",
    user_id: "00000000-0000-0000-0000-000000000020",
    creator_profile_id: PUBLIC_CREATOR.id,
  },
  {
    donor_name: "Anonymous",
    amount: "9999",
    user_id: null,
    creator_profile_id: PUBLIC_CREATOR.id,
  },
];

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

// Mutable in-memory profile. The dashboard server component reads it on
// render; the API routes (when not short-circuited by page.route) PATCH it.
// Reset to the un-onboarded state on every server start.
let profile = {
  id: "00000000-0000-0000-0000-0000000000a",
  user_id: STUB_USER.id,
  handle: null,
  handle_hash: null,
  owner_address: null,
  onchain_registered: false,
  payout_address: null,
  wallet_link_nonce: null,
  wallet_link_nonce_expires_at: null,
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
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

/** Extract `col=eq.value` filters from the PostgREST query string. */
function eqFilters(query) {
  const filters = {};
  for (const [key, value] of query.entries()) {
    const m = /^([a-z_]+)=eq\.(.+)$/.exec(`${key}=${value}`);
    if (m) filters[m[1]] = m[2];
  }
  return filters;
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

    // PostgREST: public_profiles (the public read view of active creators).
    if (path === "/rest/v1/public_profiles" && req.method === "GET") {
      json(res, 200, PUBLIC_CREATORS.map(({ handle, display_name, avatar_url, bio, onchain_registered }) => ({
        handle,
        display_name,
        avatar_url,
        bio,
        onchain_registered,
      })));
      return;
    }

    // PostgREST: donations. The explore page reads all confirmed/indexed
    // visible donations; the creator page filters by creator_profile_id.
    if (path === "/rest/v1/donations" && req.method === "GET") {
      const filters = eqFilters(query);
      let rows = DONATIONS;
      if (filters.creator_profile_id) {
        rows = rows.filter((d) => d.creator_profile_id === filters.creator_profile_id);
      }
      json(res, 200, rows.map(({ donor_name, amount, user_id }) => ({ donor_name, amount, user_id })));
      return;
    }

    // PostgREST: profiles. The dashboard reads the caller's profile by
    // user_id; the creator page reads a public creator by handle. When a
    // `handle=eq.<h>` filter is present, return the matching public creator
    // (or an empty array so maybeSingle resolves null -> notFound). Otherwise
    // return the in-memory user profile.
    if (path === "/rest/v1/profiles") {
      if (req.method === "GET") {
        const filters = eqFilters(query);
        if (filters.handle) {
          const match = PUBLIC_CREATORS.find((c) => c.handle === filters.handle);
          json(res, 200, match ? [match] : []);
          return;
        }
        json(res, 200, [profile]);
        return;
      }
      if (req.method === "PATCH" || req.method === "POST") {
        const raw = await readBody(req);
        let patch = {};
        try {
          patch = raw ? JSON.parse(raw) : {};
        } catch {
          patch = {};
        }
        profile = { ...profile, ...patch };
        json(res, 200, profile);
        return;
      }
    }

    // PostgREST: tokens (the donate page reads the allowlist on mount).
    if (path === "/rest/v1/tokens" && req.method === "GET") {
      json(res, 200, [
        {
          contract_address: "CUSDC",
          symbol: "USDC",
          name: "USD Coin",
          issuer: null,
          decimals: 6,
          icon_url: null,
        },
      ]);
      return;
    }

    // Anything else: return an empty 200 so unrelated SDK pings do not fail.
    json(res, 200, {});
    void readBody;
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
