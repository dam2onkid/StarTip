// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createVerifyApp, pollVerify, type VerifyAppDeps } from "./server";

/**
 * apps/worker/src/server — `POST /verify` HTTP contract.
 *
 * Tests cover: unauthorized (401), invalid body (400), happy path (200),
 * tx not found within poll window (202), tx failed (409), event not found
 * (409), and the poll loop retrying on NOT_FOUND then succeeding.
 *
 * The shared `verifyDonation` function is exercised end-to-end through the
 * Hono app: RPC and Supabase are mocked, so the full decode + upsert path
 * runs.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const DONOR = StellarSdk.Keypair.random();
const DONOR_ADDRESS = DONOR.publicKey();
const TX_HASH = "deadbeef".repeat(8);
const SECRET = "test-secret";

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
      const r = responders[`${call.table}:${call.method}`];
      return Promise.resolve(r ? r(call) : { data: null, error: null });
    }
    return self;
  }
  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

function makeDonationReceivedEvent(token: string): StellarSdk.xdr.ContractEvent {
  const fields: Record<string, unknown> = {
    creator_id_hash: Buffer.alloc(32, 0xab),
    token,
    amount: BigInt("1000000"),
    fee_amount: BigInt("50000"),
    net_amount: BigInt("950000"),
    treasury_address: DONOR_ADDRESS,
    payout_address: DONOR_ADDRESS,
  };
  const entries = Object.entries(fields).map(([key, value]) => {
    let val: StellarSdk.xdr.ScVal;
    if (Buffer.isBuffer(value)) val = StellarSdk.xdr.ScVal.scvBytes(value);
    else if (typeof value === "bigint") val = new StellarSdk.ScInt(value).toI128();
    else if (typeof value === "string" && value.startsWith("G") && value.length === 56)
      val = StellarSdk.Address.fromString(value).toScVal();
    else if (typeof value === "string") val = StellarSdk.xdr.ScVal.scvString(value);
    else throw new Error(`unsupported field ${key}`);
    return new StellarSdk.xdr.ScMapEntry({ key: StellarSdk.xdr.ScVal.scvSymbol(key), val });
  });
  return new StellarSdk.xdr.ContractEvent({
    ext: new StellarSdk.xdr.ExtensionPoint(0),
    contractId: null,
    type: StellarSdk.xdr.ContractEventType.contract(),
    body: new StellarSdk.xdr.ContractEventBody(
      0,
      new StellarSdk.xdr.ContractEventV0({
        topics: [StellarSdk.xdr.ScVal.scvSymbol("DonationReceived")],
        data: StellarSdk.xdr.ScVal.scvMap(entries),
      }),
    ),
  });
}

function makeSuccessTxResponse(event: StellarSdk.xdr.ContractEvent, sourceKeypair: StellarSdk.Keypair) {
  const account = new StellarSdk.Account(sourceKeypair.publicKey(), "0");
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const hostFn = StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
    new StellarSdk.xdr.InvokeContractArgs({
      contractAddress: contract.address().toScAddress(),
      functionName: "donate",
      args: [],
    }),
  );
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(StellarSdk.Operation.invokeHostFunction({ func: hostFn }))
    .setTimeout(30)
    .build();
  const opResult = StellarSdk.xdr.OperationResult.opInner(
    StellarSdk.xdr.OperationResultTr.invokeHostFunction(
      StellarSdk.xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(0)),
    ),
  );
  const resultXdr = new StellarSdk.xdr.TransactionResult({
    feeCharged: StellarSdk.xdr.Int64.fromString("100"),
    result: StellarSdk.xdr.TransactionResultResult.txSuccess([opResult]),
    ext: new StellarSdk.xdr.TransactionResultExt(0),
  });
  return {
    status: StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS,
    txHash: TX_HASH,
    latestLedger: 200,
    latestLedgerCloseTime: 0,
    oldestLedger: 1,
    oldestLedgerCloseTime: 0,
    ledger: 100,
    createdAt: 0,
    applicationOrder: 1,
    feeBump: false,
    envelopeXdr: tx.toEnvelope(),
    resultXdr,
    resultMetaXdr: new StellarSdk.xdr.TransactionMeta(0, []),
    events: {
      transactionEventsXdr: [],
      contractEventsXdr: [[event]],
    },
  } as unknown as StellarSdk.rpc.Api.GetSuccessfulTransactionResponse;
}

function makeNotFoundResponse() {
  return {
    status: StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND,
    txHash: TX_HASH,
    latestLedger: 0,
    latestLedgerCloseTime: 0,
    oldestLedger: 0,
    oldestLedgerCloseTime: 0,
  } as unknown as StellarSdk.rpc.Api.GetTransactionResponse;
}

function makeFailedResponse() {
  return {
    status: StellarSdk.rpc.Api.GetTransactionStatus.FAILED,
    txHash: TX_HASH,
    latestLedger: 200,
    latestLedgerCloseTime: 0,
    oldestLedger: 1,
    oldestLedgerCloseTime: 0,
    ledger: 100,
    createdAt: 0,
    applicationOrder: 1,
    feeBump: false,
    envelopeXdr: undefined,
    resultXdr: undefined,
    resultMetaXdr: undefined,
    events: { transactionEventsXdr: [], contractEventsXdr: [] },
  } as unknown as StellarSdk.rpc.Api.GetFailedTransactionResponse;
}

function makeEventNotFoundSuccessResponse(sourceKeypair: StellarSdk.Keypair) {
  const otherEvent = new StellarSdk.xdr.ContractEvent({
    ext: new StellarSdk.xdr.ExtensionPoint(0),
    contractId: null,
    type: StellarSdk.xdr.ContractEventType.contract(),
    body: new StellarSdk.xdr.ContractEventBody(
      0,
      new StellarSdk.xdr.ContractEventV0({
        topics: [StellarSdk.xdr.ScVal.scvSymbol("CreatorRegistered")],
        data: StellarSdk.xdr.ScVal.scvMap([]),
      }),
    ),
  });
  return makeSuccessTxResponse(otherEvent, sourceKeypair);
}

describe("POST /verify", () => {
  let supabaseMock: ReturnType<typeof createMockSupabase>;
  let getTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supabaseMock = createMockSupabase();
    getTransaction = vi.fn();
  });

  function deps(): VerifyAppDeps {
    return {
      service: supabaseMock.supabase as unknown as SupabaseClient,
      rpc: { getTransaction } as unknown as VerifyAppDeps["rpc"],
      contractId: CONTRACT_ID,
    };
  }

  function app(pollMaxMs = 30_000, pollIntervalMs = 1_000) {
    return createVerifyApp(deps(), { pollMaxMs, pollIntervalMs }, SECRET);
  }

  async function postVerify(body: unknown, headers: Record<string, string> = {}) {
    return app().request("/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 unauthorized when the secret is missing", async () => {
    const res = await app().request("/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx_hash: TX_HASH }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized when the secret is wrong", async () => {
    const res = await postVerify(
      { tx_hash: TX_HASH },
      { authorization: "Bearer wrong-secret" },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 invalid_body when tx_hash is missing", async () => {
    const res = await postVerify({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    const res = await app().request("/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 200 confirmed on the happy path (tx SUCCESS, event found, row upserted)", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR),
    );
    const res = await postVerify({
      tx_hash: TX_HASH,
      message: "Great work!",
      donor_name: "Alice",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "confirmed" });
  });

  it("returns 409 tx_failed when the tx status is FAILED", async () => {
    getTransaction.mockResolvedValue(makeFailedResponse());
    const res = await postVerify({ tx_hash: TX_HASH });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "tx_failed" });
  });

  it("returns 409 donation_event_not_found when the SUCCESS tx has no DonationReceived event", async () => {
    getTransaction.mockResolvedValue(makeEventNotFoundSuccessResponse(DONOR));
    const res = await postVerify({ tx_hash: TX_HASH });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "donation_event_not_found" });
  });

  it("returns 202 pending when the tx is NOT_FOUND and the poll window expires", async () => {
    // Always NOT_FOUND: the poll loop should exhaust the window and return 202.
    getTransaction.mockResolvedValue(makeNotFoundResponse());
    // Use a tiny poll window + interval so the test runs fast.
    const res = await createVerifyApp(
      deps(),
      { pollMaxMs: 50, pollIntervalMs: 10 },
      SECRET,
    ).request("/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify({ tx_hash: TX_HASH }),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "pending" });
  });
});

describe("pollVerify", () => {
  let supabaseMock: ReturnType<typeof createMockSupabase>;
  let getTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supabaseMock = createMockSupabase();
    getTransaction = vi.fn();
  });

  function deps(): VerifyAppDeps {
    return {
      service: supabaseMock.supabase as unknown as SupabaseClient,
      rpc: { getTransaction } as unknown as VerifyAppDeps["rpc"],
      contractId: CONTRACT_ID,
    };
  }

  it("retries on NOT_FOUND and returns 200 once the tx becomes SUCCESS", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    // First two polls: NOT_FOUND. Third poll: SUCCESS.
    getTransaction
      .mockResolvedValueOnce(makeNotFoundResponse())
      .mockResolvedValueOnce(makeNotFoundResponse())
      .mockResolvedValueOnce(
        makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR),
      );

    const result = await pollVerify(deps(), { tx_hash: TX_HASH }, 10_000, 1);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "confirmed" });
    expect(getTransaction).toHaveBeenCalledTimes(3);
  });

  it("returns 202 when the poll window expires with the tx still NOT_FOUND", async () => {
    getTransaction.mockResolvedValue(makeNotFoundResponse());
    const result = await pollVerify(deps(), { tx_hash: TX_HASH }, 30, 5);
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ status: "pending" });
  });

  it("returns immediately on 409 tx_failed without retrying", async () => {
    getTransaction.mockResolvedValue(makeFailedResponse());
    const result = await pollVerify(deps(), { tx_hash: TX_HASH }, 10_000, 1);
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ error: "tx_failed" });
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });
});
