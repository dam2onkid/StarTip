// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/donations/prepare — `prepareDonation` HTTP contract.
 *
 * Validates the handle (registered + not paused), the token (in the on-chain
 * allowlist mirrored to `tokens`), stores `user_id` when a session is present
 * else NULL, inserts a pending row whose `donation_id_hash = sha256(id::text)`,
 * and returns the metadata the client needs to build the `donate()` tx.
 *
 * Supabase is mocked with a fluent recorder so the test can assert on the
 * inserted row and the filters used. The session client is a small stub that
 * reports either no user or a fixed user id.
 */

const CREATOR_PROFILE_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000b2";
const HANDLE = "ada";
const HANDLE_HASH_HEX = "ab".repeat(32);
const TOKEN = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";

type Method = "select" | "insert" | "update" | "upsert" | "delete";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  payload: unknown;
  selectCols: string | null;
}

function createMockSupabase() {
  const calls: RecordedCall[] = [];
  const responders: Record<string, (call: RecordedCall) => { data: unknown; error: unknown }> = {};

  function respond(call: RecordedCall) {
    const r = responders[`${call.table}:${call.method}`];
    return r ? r(call) : { data: null, error: null };
  }
  function setResponder(key: string, fn: (call: RecordedCall) => { data: unknown; error: unknown }) {
    responders[key] = fn;
  }

  function query(table: string) {
    const state = {
      method: null as Method | null,
      filters: {} as Record<string, unknown>,
      payload: null as unknown,
      selectCols: null as string | null,
      committed: false,
    };
    const self = {
      select(cols: string) { state.method = "select"; state.selectCols = cols; return self; },
      insert(payload: unknown) { state.method = "insert"; state.payload = payload; return self; },
      update(payload: unknown) { state.method = "update"; state.payload = payload; return self; },
      upsert(payload: unknown) { state.method = "upsert"; state.payload = payload; return self; },
      delete() { state.method = "delete"; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      neq(col: string, value: unknown) { state.filters[col] = `neq:${value}`; return self; },
      maybeSingle() { return commit(); },
      single() { return commit(); },
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
           onRejected?: (e: unknown) => unknown) {
        return commit().then(
          onFulfilled as ((v: unknown) => unknown) | null,
          onRejected as ((e: unknown) => unknown) | null,
        );
      },
    };
    function commit() {
      if (state.committed) return Promise.resolve({ data: null, error: null });
      state.committed = true;
      const call: RecordedCall = {
        table,
        method: (state.method ?? "select") as Method,
        filters: { ...state.filters },
        payload: state.payload,
        selectCols: state.selectCols,
      };
      calls.push(call);
      return Promise.resolve(respond(call));
    }
    return self;
  }

  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

function findCall(calls: RecordedCall[], table: string, method: Method): RecordedCall | undefined {
  return calls.find((c) => c.table === table && c.method === method);
}

/** sha256(uuid::text) as a `\x`-prefixed hex string, matching the bytea wire format. */
function expectedHashHex(id: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return "\\x" + createHash("sha256").update(id, "utf8").digest("hex");
}

describe("prepareDonation", () => {
  const contractId = "C-TEST-CONTRACT";
  let service: ReturnType<typeof createMockSupabase>;
  let getUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = createMockSupabase();
    getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
  });

  function makeSessionClient() {
    return { auth: { getUser } } as unknown as SupabaseClient;
  }

  function activeCreator(over: Record<string, unknown> = {}) {
    return {
      id: CREATOR_PROFILE_ID,
      handle: HANDLE,
      handle_hash: "\\x" + HANDLE_HASH_HEX,
      onchain_registered: true,
      paused: false,
      ...over,
    };
  }

  function tokenRow(over: Record<string, unknown> = {}) {
    return {
      contract_address: TOKEN,
      symbol: "USDC",
      name: "USD Coin",
      issuer: null,
      decimals: 6,
      icon_url: null,
      ...over,
    };
  }

  /** Configure the mock so a profiles select-by-handle returns the given row. */
  function profilesRespond(row: unknown) {
    service.setResponder("profiles:select", () => ({ data: row, error: null }));
  }
  function tokensRespond(rows: unknown) {
    service.setResponder("tokens:select", () => ({ data: rows, error: null }));
  }
  function donorProfileRespond(row: unknown) {
    // The donor profile lookup is also a profiles:select; the recorder does
    // not distinguish filters, so we route by call order via a counter.
  }
  void donorProfileRespond;

  it("returns 400 invalid_body when required fields are missing", async () => {
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: "", token: "", amount: "" },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("returns 404 creator_not_found when the handle has no profile", async () => {
    profilesRespond(null);
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "creator_not_found" });
  });

  it("returns 409 creator_paused when the creator is paused", async () => {
    profilesRespond(activeCreator({ paused: true }));
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "creator_paused" });
  });

  it("returns 409 creator_not_registered when onchain_registered is false", async () => {
    profilesRespond(activeCreator({ onchain_registered: false }));
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "creator_not_registered" });
  });

  it("returns 400 token_not_allowed when the token is not in the allowlist", async () => {
    profilesRespond(activeCreator());
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: "COTHER", amount: "1000000" },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "token_not_allowed" });
  });

  it("inserts a pending row with user_id NULL for an anonymous donor and returns the metadata", async () => {
    profilesRespond(activeCreator());
    tokensRespond([tokenRow()]);
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000", message: "hi", donor_name: "Pat" },
    );
    expect(res.status).toBe(200);
    const body = res.body as unknown as Record<string, unknown>;
    expect(body.contract_id).toBe(contractId);
    expect(body.handle_hash).toBe(HANDLE_HASH_HEX);
    expect(Array.isArray(body.token_allowlist)).toBe(true);
    const donationId = body.donation_id as string;
    expect(donationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.donation_id_hash).toBe(expectedHashHex(donationId).slice(2));

    const insert = findCall(service.calls, "donations", "insert");
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: donationId,
      donation_id_hash: expectedHashHex(donationId),
      creator_profile_id: CREATOR_PROFILE_ID,
      handle_hash: "\\x" + HANDLE_HASH_HEX,
      token: TOKEN,
      amount: "1000000",
      message: "hi",
      donor_name: "Pat",
      user_id: null,
      status: "pending",
    });
  });

  it("defaults donor_name to 'Anonymous' for an anonymous donor with no name", async () => {
    profilesRespond(activeCreator());
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(200);
    const insert = findCall(service.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).donor_name).toBe("Anonymous");
  });

  it("stores user_id and uses the profile display_name when logged in and non-default", async () => {
    // First profiles select -> creator; second profiles select -> donor profile.
    let profilesCallCount = 0;
    service.setResponder("profiles:select", () => {
      profilesCallCount++;
      if (profilesCallCount === 1) return { data: activeCreator(), error: null };
      return { data: { display_name: "Ada Lovelace" }, error: null };
    });
    tokensRespond([tokenRow()]);
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000", donor_name: "ignored" },
    );
    expect(res.status).toBe(200);
    const insert = findCall(service.calls, "donations", "insert");
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.user_id).toBe(USER_ID);
    expect(payload.donor_name).toBe("Ada Lovelace");
  });

  it("falls back to the body donor_name when the logged-in profile display_name is the default", async () => {
    let profilesCallCount = 0;
    service.setResponder("profiles:select", () => {
      profilesCallCount++;
      if (profilesCallCount === 1) return { data: activeCreator(), error: null };
      return { data: { display_name: "Anonymous" }, error: null };
    });
    tokensRespond([tokenRow()]);
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000", donor_name: "Pat" },
    );
    expect(res.status).toBe(200);
    const insert = findCall(service.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).donor_name).toBe("Pat");
  });

  it("returns 500 db_error when the insert fails", async () => {
    profilesRespond(activeCreator());
    tokensRespond([tokenRow()]);
    service.setResponder("donations:insert", () => ({ data: null, error: { message: "boom" } }));
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: "db_error" });
  });

  it("returns the full token allowlist in the response", async () => {
    profilesRespond(activeCreator());
    const allowlist = [
      tokenRow(),
      tokenRow({ contract_address: "CXLM", symbol: "XLM", name: "Lumen", decimals: 7 }),
    ];
    tokensRespond(allowlist);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "1000000" },
    );
    expect(res.status).toBe(200);
    const body = res.body as unknown as Record<string, unknown>;
    expect(body.token_allowlist).toEqual(allowlist);
  });

  it("rejects a non-positive amount", async () => {
    profilesRespond(activeCreator());
    tokensRespond([tokenRow()]);
    const { prepareDonation } = await import("@/lib/donations/prepare");
    const res = await prepareDonation(
      { service: service.supabase as any, session: makeSessionClient(), contractId },
      { handle: HANDLE, token: TOKEN, amount: "0" },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_amount" });
  });

  void randomUUID;
});
