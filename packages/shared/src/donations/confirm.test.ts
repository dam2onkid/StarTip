// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/donations/confirm — `confirmDonation` HTTP contract.
 *
 * Fetches the tx from RPC by `tx_hash`, verifies it succeeded, extracts the
 * `DonationReceived` event, checks `event.donation_id_hash == sha256(donation_id)`,
 * extracts `donor_address` from the tx source account, upserts by `tx_hash` as
 * `confirmed`, and promotes an `indexed` row to `confirmed`. Supabase is mocked
 * with a fluent recorder; the RPC returns a real `GetSuccessfulTransactionResponse`
 * built from XDR so the event-decoding and source-account extraction paths run
 * end-to-end.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const DONOR = StellarSdk.Keypair.random();
const DONOR_ADDRESS = DONOR.publicKey();
const DONATION_ID = "00000000-0000-0000-0000-0000000000d1";
const DONATION_ID_HASH = createHash("sha256").update(DONATION_ID, "utf8").digest();
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

/** Build a DonationReceived ContractEvent with the given donation_id_hash buffer. */
function makeDonationReceivedEvent(donationIdHash: Buffer, token: string): StellarSdk.xdr.ContractEvent {
  const fields: Record<string, unknown> = {
    creator_id_hash: Buffer.alloc(32, 0xab),
    token,
    amount: BigInt("1000000"),
    fee_amount: BigInt("50000"),
    net_amount: BigInt("950000"),
    treasury_address: DONOR_ADDRESS,
    payout_address: DONOR_ADDRESS,
    donation_id_hash: donationIdHash,
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
  // confirmDonation only inspects `status` for a FAILED tx (it returns
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

describe("confirmDonation", () => {
  let supabaseMock: ReturnType<typeof createMockSupabase>;
  let getTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supabaseMock = createMockSupabase();
    getTransaction = vi.fn();
  });

  function deps() {
    return {
      service: supabaseMock.supabase as unknown as SupabaseClient,
      rpc: { getTransaction } as unknown as import("./confirm").ConfirmDeps["rpc"],
      contractId: CONTRACT_ID,
    };
  }

  it("returns 400 invalid_body when tx_hash or donation_id is missing", async () => {
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: "", donation_id: "" });
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
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "tx_not_found" });
  });

  it("returns 409 tx_failed when the tx status is FAILED", async () => {
    getTransaction.mockResolvedValue(makeFailedTxResponse());
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
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
          topics: [StellarSdk.xdr.ScVal.scvSymbol("CreatorRegistered")],
          data: StellarSdk.xdr.ScVal.scvMap([]),
        }),
      ),
    });
    getTransaction.mockResolvedValue(makeSuccessTxResponse(otherEvent, DONOR));
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "donation_event_not_found" });
  });

  it("returns 409 donation_id_hash_mismatch when the event hash does not match sha256(donation_id)", async () => {
    const wrongHash = createHash("sha256").update("other", "utf8").digest();
    getTransaction.mockResolvedValue(makeSuccessTxResponse(makeDonationReceivedEvent(wrongHash, "USDC"), DONOR));
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "donation_id_hash_mismatch" });
  });

  it("upserts an existing pending row to confirmed with donor_address from the tx source", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: { id: "d1", status: "pending" }, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "confirmed" });

    const update = findCall(supabaseMock.calls, "donations", "update");
    expect(update).toBeDefined();
    expect(update!.filters).toEqual({ id: "d1" });
    expect(update!.payload).toMatchObject({
      status: "confirmed",
      tx_hash: TX_HASH,
      donor_address: DONOR_ADDRESS,
      confirmed_at: expect.any(String),
    });
  });

  it("promotes an indexed row to confirmed", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: { id: "d9", status: "indexed" }, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).status).toBe("confirmed");
    expect(update!.filters).toEqual({ id: "d9" });
  });

  it("inserts a new confirmed row when no existing donation matches the hash", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({
      donation_id_hash: "\\x" + DONATION_ID_HASH.toString("hex"),
      tx_hash: TX_HASH,
      creator_profile_id: "p1",
      donor_address: DONOR_ADDRESS,
      status: "confirmed",
      confirmed_at: expect.any(String),
    });
  });

  it("returns 409 creator_not_found when the event's handle_hash has no profile and no pending row", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: null, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the upsert fails", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: { id: "d1", status: "pending" }, error: null }));
    supabaseMock.setResponder("donations:update", () => ({ data: null, error: { message: "boom" } }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: "db_error" });
  });

  it("sets moderation_status = 'visible' on the no-existing-row insert via classifyMessage", async () => {
    supabaseMock.setResponder("donations:select", () => ({ data: null, error: null }));
    supabaseMock.setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    const insert = findCall(supabaseMock.calls, "donations", "insert");
    expect((insert!.payload as Record<string, unknown>).moderation_status).toBe("visible");
  });

  it("re-runs classifyMessage on the promote path when the existing row is pending, setting auto_hidden for a banned keyword", async () => {
    const { BANNED_KEYWORDS } = await import("./moderation");
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d1", status: "pending", message: `hey ${BANNED_KEYWORDS[0]}`, donor_name: "Pat" },
      error: null,
    }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).moderation_status).toBe("auto_hidden");
  });

  it("does not overwrite moderation_status on the promote path when the existing row is not pending", async () => {
    supabaseMock.setResponder("donations:select", () => ({
      data: { id: "d9", status: "indexed", message: "clean", donor_name: "Pat" },
      error: null,
    }));
    getTransaction.mockResolvedValue(
      makeSuccessTxResponse(makeDonationReceivedEvent(DONATION_ID_HASH, "USDC"), DONOR),
    );
    const { confirmDonation } = await import("./confirm");
    const res = await confirmDonation(deps(), { tx_hash: TX_HASH, donation_id: DONATION_ID });
    expect(res.status).toBe(200);
    const update = findCall(supabaseMock.calls, "donations", "update");
    expect((update!.payload as Record<string, unknown>).moderation_status).toBeUndefined();
  });
});
