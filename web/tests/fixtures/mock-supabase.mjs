// Mock Supabase Auth + PostgREST + Storage server for Playwright E2E.
//
// The StarTip web app points `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` at
// this server during E2E runs. It implements the subset of the Supabase surface
// that the login -> dashboard (donor + creator tabs) -> onboarding
// -> donate -> explore -> creator page flow needs:
//
//   POST /auth/v1/signup         -> auto-confirm + session (email + password)
//   POST /auth/v1/token          -> session (password grant + refresh)
//   GET  /auth/v1/user           -> the stub user (Bearer access_token)
//   POST /auth/v1/logout         -> 204
//   GET  /rest/v1/profiles       -> the stub profile (dashboard), a public
//                                   creator when queried by `handle=eq.<h>`,
//                                   or a set of creators when queried by
//                                   `id=in.(...)` (per-creator rank lookup)
//   PATCH /rest/v1/profiles      -> 200 (owner UPDATE; shape echoed)
//   GET  /rest/v1/public_profiles-> the list of registered, not-paused creators
//   GET  /rest/v1/donations      -> donations filtered by creator_profile_id,
//                                   user_id, status, moderation_status; columns
//                                   projected from the `select` query param
//   GET  /rest/v1/tokens         -> the stub token allowlist (PostgREST array)
//   POST /storage/v1/object/avatars/<path> -> 200 (avatar upload; public URL
//                                   derived client-side by supabase-js)
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

// Full donation rows. The mock projects the requested columns via the
// PostgREST `select` query param. The first three are the original seeded
// donations (Ada, Bob, anonymous); the fourth is the stub user ("Fan") so the
// Donor tab has a history and a leaderboard rank. Anonymous donations
// (user_id null) are excluded from leaderboards by the aggregation helpers.
const DONATIONS = [
  {
    id: "00000000-0000-0000-0000-0000000000d1",
    donor_name: "Ada",
    amount: "100",
    user_id: "00000000-0000-0000-0000-000000000010",
    creator_profile_id: PUBLIC_CREATOR.id,
    token: "USDC",
    message: "Thank you!",
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000d2",
    donor_name: "Bob",
    amount: "500",
    user_id: "00000000-0000-0000-0000-000000000020",
    creator_profile_id: PUBLIC_CREATOR.id,
    token: "USDC",
    message: null,
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-02T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000d3",
    donor_name: "Anonymous",
    amount: "9999",
    user_id: null,
    creator_profile_id: PUBLIC_CREATOR.id,
    token: "USDC",
    message: null,
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-03T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000d4",
    donor_name: "Fan",
    amount: "300",
    user_id: STUB_USER.id,
    creator_profile_id: PUBLIC_CREATOR.id,
    token: "USDC",
    message: "Keep it up!",
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-04T00:00:00Z",
  },
  // Hidden donation: same creator, but moderation_status = 'hidden'. The
  // overlay queries with moderation_status=eq.visible so this row is filtered
  // out by the mock (mirroring the donations_anon_visible_select RLS policy).
  // The overlay E2E asserts this donation's message never appears.
  {
    id: "00000000-0000-0000-0000-0000000000d5",
    donor_name: "Troll",
    amount: "1",
    user_id: "00000000-0000-0000-0000-000000000040",
    creator_profile_id: PUBLIC_CREATOR.id,
    token: "USDC",
    message: "hidden bad words",
    status: "confirmed",
    moderation_status: "hidden",
    created_at: "2026-06-05T00:00:00Z",
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
  display_name: "Fan",
  avatar_url: null,
  bio: null,
  handle: null,
  handle_hash: null,
  owner_address: null,
  onchain_registered: false,
  payout_address: null,
  paused: false,
  wallet_link_nonce: null,
  wallet_link_nonce_expires_at: null,
};

// Creator-mode: when enabled, the stub user IS a registered on-chain Creator.
// The dashboard server component then loads the Creator active-features panel.
// Toggled via `POST /mock/creator-mode` with `{ "enabled": true }`.
const CREATOR_MODE_PROFILE_ID = "00000000-0000-0000-0000-0000000000c0";
const CREATOR_MODE_DONATIONS = [
  {
    id: "00000000-0000-0000-0000-000000000e1",
    donor_name: "Bob",
    amount: "500",
    user_id: "00000000-0000-0000-0000-000000000020",
    creator_profile_id: CREATOR_MODE_PROFILE_ID,
    token: "USDC",
    message: "Nice stream!",
    donor_address: "GBBOB",
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-02T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000e2",
    donor_name: "Troll",
    amount: "1",
    user_id: "00000000-0000-0000-0000-000000000030",
    creator_profile_id: CREATOR_MODE_PROFILE_ID,
    token: "USDC",
    message: "bad words",
    donor_address: "GBTROLL",
    status: "confirmed",
    moderation_status: "hidden",
    created_at: "2026-06-03T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000e3",
    donor_name: "Anonymous",
    amount: "9999",
    user_id: null,
    creator_profile_id: CREATOR_MODE_PROFILE_ID,
    token: "USDC",
    message: null,
    donor_address: null,
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-04T00:00:00Z",
  },
];
// Mutable copies so moderation PATCHes persist for the duration of the run.
let creatorModeDonations = CREATOR_MODE_DONATIONS.map((d) => ({ ...d }));
let creatorMode = false;
function creatorModeProfile() {
  return {
    ...profile,
    id: CREATOR_MODE_PROFILE_ID,
    handle: "ada",
    owner_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
    onchain_registered: true,
    payout_address: "GBPAYOUTADDRESS",
    paused: false,
  };
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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

/** Extract `col=in.(v1,v2,...)` filters from the PostgREST query string. */
function inFilters(query) {
  const filters = {};
  for (const [key, value] of query.entries()) {
    const m = /^([a-z_]+)=in\.\((.+)\)$/.exec(`${key}=${value}`);
    if (m) filters[m[1]] = m[2].split(",");
  }
  return filters;
}

/** Project each row to only the columns named in the PostgREST `select` param.
 * If no select param is present, return the rows as-is. */
function project(rows, selectParam) {
  if (!selectParam) return rows;
  const cols = selectParam.split(",").map((c) => c.trim()).filter(Boolean);
  return rows.map((row) => {
    const out = {};
    for (const c of cols) {
      if (c in row) out[c] = row[c];
    }
    return out;
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

    // Email + password signup. Auto-confirms and returns a session so the
    // E2E flow can proceed without an email round-trip (mirrors a confirmed
    // user signing up against a real Supabase project with confirmation off,
    // or the post-confirmation state).
    if (req.method === "POST" && path === "/auth/v1/signup") {
      await readBody(req);
      json(res, 200, {
        user: STUB_USER,
        session: SESSION,
      });
      return;
    }

    // Mock control: toggle creator-mode. When enabled, the stub user IS a
    // registered on-chain Creator so the dashboard renders the active panel.
    // `POST /mock/creator-mode { "enabled": true }` turns it on; passing
    // `false` resets to the donor-only profile. Also resets the
    // creator-mode donations so moderation PATCHes do not leak across runs.
    if (req.method === "POST" && path === "/mock/creator-mode") {
      const raw = await readBody(req);
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      creatorMode = !!body.enabled;
      creatorModeDonations = CREATOR_MODE_DONATIONS.map((d) => ({ ...d }));
      // Seed or reset the base profile fields so creator-mode PATCHes do not
      // leak into the donor-only profile when creator-mode is disabled.
      if (creatorMode) {
        profile.display_name = "Ada";
        profile.bio = "Pioneer programmer.";
        profile.avatar_url = null;
      } else {
        profile.display_name = "Fan";
        profile.bio = null;
        profile.avatar_url = null;
      }
      json(res, 200, { creatorMode });
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

    // Storage: avatar upload. Accept any path under avatars/ and return the
    // supabase-js success shape. getPublicUrl is computed client-side.
    if (req.method === "POST" && path.startsWith("/storage/v1/object/avatars/")) {
      // Drain the body (the file bytes).
      await readBody(req);
      const objectPath = path.replace("/storage/v1/object/", "");
      json(res, 200, { Key: objectPath });
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

    // PostgREST: donations. Filters: creator_profile_id (eq), user_id (eq),
    // status (in), moderation_status (eq). Columns projected from `select`.
    // In creator-mode, donations for the creator's profile_id come from the
    // creator-mode donation set (so the active panel sees Bob + Troll + Anon);
    // donor-history queries (user_id eq) still read the donor donations.
    if (path === "/rest/v1/donations") {
      if (req.method === "GET") {
        const eq = eqFilters(query);
        const ins = inFilters(query);
        let rows;
        if (creatorMode && eq.creator_profile_id === CREATOR_MODE_PROFILE_ID) {
          rows = creatorModeDonations.slice();
        } else {
          rows = DONATIONS.slice();
        }
        if (eq.creator_profile_id) {
          rows = rows.filter((d) => d.creator_profile_id === eq.creator_profile_id);
        }
        if (eq.user_id) {
          rows = rows.filter((d) => d.user_id === eq.user_id);
        }
        if (ins.status) {
          rows = rows.filter((d) => ins.status.includes(d.status));
        }
        if (eq.moderation_status) {
          rows = rows.filter((d) => d.moderation_status === eq.moderation_status);
        }
        // Order by created_at descending when requested (donor history / moderation list).
        if (query.get("order") === "created_at.desc") {
          rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        }
        json(res, 200, project(rows, query.get("select")));
        return;
      }
      // PATCH /rest/v1/donations?id=eq.<id>: creator moderation toggle. Only
      // `moderation_status` is writable (mirrors the column-level GRANT). The
      // moderation RLS policy would reject a non-creator, but the mock does
      // not enforce RLS; the E2E drives it as the creator.
      if (req.method === "PATCH") {
        const eq = eqFilters(query);
        const raw = await readBody(req);
        let patch = {};
        try { patch = raw ? JSON.parse(raw) : {}; } catch { patch = {}; }
        if (eq.id && "moderation_status" in patch) {
          creatorModeDonations = creatorModeDonations.map((d) =>
            d.id === eq.id ? { ...d, moderation_status: patch.moderation_status } : d,
          );
          const updated = creatorModeDonations.find((d) => d.id === eq.id);
          json(res, 200, updated ? [updated] : []);
        } else {
          json(res, 200, []);
        }
        return;
      }
    }

    // PostgREST: profiles. The dashboard reads the caller's profile by
    // user_id; the creator page reads a public creator by handle; the
    // dashboard service-role path reads creators by id=in.(...) for the
    // per-creator rank lookup.
    if (path === "/rest/v1/profiles") {
      if (req.method === "GET") {
        const eq = eqFilters(query);
        const ins = inFilters(query);
        if (eq.handle) {
          const match = PUBLIC_CREATORS.find((c) => c.handle === eq.handle);
          json(res, 200, match ? [match] : []);
          return;
        }
        if (ins.id) {
          const matches = PUBLIC_CREATORS.filter((c) => ins.id.includes(c.id));
          json(res, 200, project(matches, query.get("select")));
          return;
        }
        // The caller's own profile. In creator-mode, return the registered
        // creator profile so the dashboard renders the active panel.
        const own = creatorMode ? creatorModeProfile() : profile;
        json(res, 200, [own]);
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
        json(res, 200, creatorMode ? { ...creatorModeProfile(), ...patch } : profile);
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
