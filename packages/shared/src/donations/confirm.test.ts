// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/donations/confirm — `verifyDonation` HTTP contract.
 *
 * Fetches the tx from RPC by `tx_hash`, verifies it succeeded, extracts the
 * `DonationReceived` event, extracts `donor_address` from the tx source
 * account, upserts by `tx_hash` as `confirmed`, and promotes an `indexed` row
 * to `confirmed` with client-supplied message/donor_name. Supabase is mocked
 * with a fluent recorder; the RPC returns a real `GetSuccessfulTransactionResponse`
 * built from XDR so the event-decoding and source-account extraction paths run
 * end-to-end.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const DONOR = StellarSdk.Keypair.random();
const DONOR_ADDRESS = DONOR.publicKey();
const TX_HASH = "deadbeef".repeat(8);

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

function findCall(calls: RecordedCall[], table: string, method: Method): RecordedCall | undefined {
  return calls.find((c) => c.table === table && c.method === method);
}

/** Build a DonationReceived ContractEvent (7 fields, no donation_id_hash per ADR-0005). */
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
        topics: [StellarSdk.xdr.ScVal.scvSymbol("donation_received")],
        data: StellarSdk.xdr.ScVal.scvMap(entries),
      }),
    ),
  });
}

/** Build a real GetSuccessfulTransactionResponse for the given event + source. */
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

function makeFailedTxResponse() {
  // verifyDonation only inspects `status` for a FAILED tx (it returns
  // tx_failed before touching envelopeXdr / events), so a minimal shape is
  // enough to exercise the contract.
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

describe("verifyDonation", () => {
  let supabaseMock: ReturnType<typeof createMockSupabase>;
  let getTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supabaseMock = createMockSupabase();
    getTransaction = vi.fn();
  });

  function deps() {
    return {
      service: supabaseMock.supabase as unknown as SupabaseClient,
      rpc: { getTransaction } as unknown as import("./confirm").VerifyDeps["rpc"],
      contractId: CONTRACT_ID,
    };
  }

  it("returns 400 invalid_body when tx_hash is missing", async () => {
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: "" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("returns 404 tx_not_found when the tx is NOT_FOUND", async () => {
    getTransaction.mockResolvedValue({
      status: StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND,
      txHash: TX_HASH,
      latestLedger: 0,
      latestLedgerCloseTime: 0,
      oldestLedger: 0,
      oldestLedgerCloseTime: 0,
    });
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "tx_not_found" });
  });

  it("returns 409 tx_failed when the tx status is FAILED", async () => {
    getTransaction.mockResolvedValue(makeFailedTxResponse());
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "tx_failed" });
  });

  it("returns 409 donation_event_not_found when no DonationReceived event is present", async () => {
    // Build an event with a different topic.
    const otherEvent = new StellarSdk.xdr.ContractEvent({
      ext: new StellarSdk.xdr.ExtensionPoint(0),
      contractId: null,
      type: StellarSdk.xdr.ContractEventType.contract(),
      body: new StellarSdk.xdr.ContractEventBody(
        0,
        new StellarSdk.xdr.ContractEventV0({
          topics: [StellarSdk.xdr.ScVal.scvSymbol("creator_registered")],
          data: StellarSdk.xdr.ScVal.scvMap([]),
        }),
      ),
    });
    getTransaction.mockResolvedValue(makeSuccessTxResponse(otherEvent, DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "donation_event_not_found" });
  });

  it("inserts a new confirmed row with message and donor_name from the input body when no existing row matches", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), {
      tx_hash: TX_HASH,
      message: "Great work!",
      donor_name: "Alice",
    });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({
      tx_hash: TX_HASH,
      creator_profile_id: "p1",
      donor_address: DONOR_ADDRESS,
      donor_name: "Alice",
      message: "Great work!",
      status: "confirmed",
      confirmed_at: expect.any(String),
    });
    // No donation_id_hash in the payload (column dropped per ADR-0005).
    expect((insert!.payload as Record<string, unknown>).donation_id_hash).toBeUndefined();
  });

  it("defaults donor_name to Anonymous and message to null when not provided in the input body", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect(insert!.payload).toMatchObject({
      donor_name: "Anonymous",
      message: null,
    });
  });

  it("stores user_id on insert when an authenticated donor is provided", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH, user_id: "u-donor" });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect(insert!.payload).toMatchObject({
      user_id: "u-donor",
    });
  });

  it("does not store user_id on insert when none is provided", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("promotes an indexed row to confirmed, filling message and donor_name from the body when the row has indexer defaults", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: null, donor_name: "Anonymous" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), {
      tx_hash: TX_HASH,
      message: "Hello",
      donor_name: "Bob",
    });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect(update!.filters).toEqual({ id: "d9" });
    expect(update!.payload).toMatchObject({
      status: "confirmed",
      donor_address: DONOR_ADDRESS,
      message: "Hello",
      donor_name: "Bob",
      confirmed_at: expect.any(String),
    });
  });

  it("does not overwrite message/donor_name on promote when the row already has non-default content", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: "existing", donor_name: "ExistingName" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), {
      tx_hash: TX_HASH,
      message: "new",
      donor_name: "NewName",
    });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).message).toBeUndefined();
    expect((update!.payload as Record<string, unknown>).donor_name).toBeUndefined();
  });

  it("sets user_id on promote when the existing row has none", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: null, donor_name: "Anonymous", user_id: null },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH, user_id: "u-donor" });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).user_id).toBe("u-donor");
  });

  it("does not overwrite an existing user_id on promote", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: null, donor_name: "Anonymous", user_id: "u-existing" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH, user_id: "u-new" });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("is an idempotent no-op (no update) when the row is already confirmed", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d1", status: "confirmed", message: "hi", donor_name: "Pat" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "confirmed" });
    expect(findCall(supabaseMock.calls, "donations", "update")).toBeUndefined();
    expect(findCall(supabaseMock.calls, "donations", "insert")).toBeUndefined();
  });

  it("returns 409 creator_not_found when the event's handle_hash has no profile and no existing row", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: null, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the upsert fails", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: { id: "d9", status: "indexed" }, error: null }));
    supabaseMock.setResponder("donations:update", () => ({ data: null, error: { message: "boom" } }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: "db_error" });
  });

  it("sets moderation_status = 'visible' on the no-existing-row insert via classifyMessage", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).moderation_status).toBe("visible");
  });

  it("sets moderation_status = 'auto_hidden' on insert when the message contains a banned keyword", async () => {
    const { BANNED_KEYWORDS } = await import("./moderation");
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), {
      tx_hash: TX_HASH,
      message: `hey ${BANNED_KEYWORDS[0]}`,
    });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).moderation_status).toBe("auto_hidden");
  });

  it("re-runs classifyMessage on the promote path when enriching with a banned keyword message", async () => {
    const { BANNED_KEYWORDS } = await import("./moderation");
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: null, donor_name: "Anonymous" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), {
      tx_hash: TX_HASH,
      message: `spam ${BANNED_KEYWORDS[0]}`,
    });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).moderation_status).toBe("auto_hidden");
  });

  it("does not set moderation_status on the promote path when no content is enriched", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: "existing", donor_name: "ExistingName" },
      error: null,
    }));
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent("USDC"), DONOR));
    const { verifyDonation } = await import("./confirm");
    const res = await verifyDonation(deps(), { tx_hash: TX_HASH });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).moderation_status).toBeUndefined();
  });
});
