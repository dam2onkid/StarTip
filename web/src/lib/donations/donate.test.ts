// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * lib/donations/donate — client-side `donate()` transaction builder + error
 * decoder. The wallet owns the signature; the server never sees the secret
 * key. A `window.__STARTIP_DONATE_STUB__` seam lets the Playwright E2E
 * harness replace the build/sign/submit pipeline with a deterministic stub.
 *
 * Tests cover:
 *   - donateOnChain happy path: builds, simulates, signs, submits, returns hash
 *   - simulate error -> throws DonateError with code from the typed enum
 *   - sendTransaction error -> throws DonateError with the result code
 *   - signer mismatch -> throws
 *   - stub seam short-circuits the pipeline
 *   - decodeDonateError maps each typed error code to a UI-facing message key
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const DONOR = StellarSdk.Keypair.random();
const DONOR_ADDRESS = DONOR.publicKey();
const HANDLE_HASH = Buffer.alloc(32, 0xab);
const DONATION_ID_HASH = Buffer.alloc(32, 0xcd);
const TOKEN = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const AMOUNT = BigInt("1000000");
const TX_HASH = "deadbeef".repeat(8);

describe("donateOnChain", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Provide a minimal `window` so the stub seam check doesn't throw.
    (globalThis as unknown as { window: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  type SignWalletTransactionFn = (txXdr: string) => Promise<{
    signedTxXdr: string;
    signerAddress: string;
  }>;

  function makeDeps(over: Partial<{
    rpc: StellarSdk.rpc.Server;
    signWalletTransaction: SignWalletTransactionFn;
    networkPassphrase: string;
    contractId: string;
  }> = {}) {
    const getAccount = vi.fn(async () => new StellarSdk.Account(DONOR_ADDRESS, "0"));
    const simulateTransaction = vi.fn();
    const sendTransaction = vi.fn();
    const rpc = {
      getAccount,
      simulateTransaction,
      sendTransaction,
    } as unknown as StellarSdk.rpc.Server;
    const signWalletTransaction = vi.fn<
      (txXdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>
    >(async () => ({
      signedTxXdr: "",
      signerAddress: DONOR_ADDRESS,
    }));
    return {
      deps: {
        rpc: over.rpc ?? rpc,
        signWalletTransaction: over.signWalletTransaction ?? signWalletTransaction,
        networkPassphrase: over.networkPassphrase ?? StellarSdk.Networks.TESTNET,
        contractId: over.contractId ?? CONTRACT_ID,
      },
      getAccount,
      simulateTransaction,
      sendTransaction,
      signWalletTransaction,
    };
  }

  /** Build a real signed transaction XDR for the donate invocation. */
  function buildSignedTxXdr(): string {
    const account = new StellarSdk.Account(DONOR_ADDRESS, "0");
    const contract = new StellarSdk.Contract(CONTRACT_ID);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "donate",
          StellarSdk.Address.fromString(DONOR_ADDRESS).toScVal(),
          StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
          StellarSdk.Address.fromString(TOKEN).toScVal(),
          new StellarSdk.ScInt(AMOUNT).toI128(),
          StellarSdk.xdr.ScVal.scvBytes(DONATION_ID_HASH),
        ),
      )
      .setTimeout(30)
      .build();
    tx.sign(DONOR);
    return tx.toXDR();
  }

  /** A successful simulateTransaction response (no auth, no resource fee). */
  function successSim() {
    // `assembleTransaction` calls `parseRawSimulation`, which checks `_parsed`.
    // Setting `_parsed: true` makes it pass through. `transactionData` must be
    // a `SorobanDataBuilder` (`.build()` is called on it). `result.auth` must
    // be an array (the auth entries from simulation).
    return {
      _parsed: true,
      id: "sim-id",
      latestLedger: 1,
      transactionData: new StellarSdk.SorobanDataBuilder(
        new StellarSdk.xdr.SorobanTransactionData({
          resources: new StellarSdk.xdr.SorobanResources({
            footprint: new StellarSdk.xdr.LedgerFootprint({ readOnly: [], readWrite: [] }),
            instructions: 0,
            diskReadBytes: 0,
            writeBytes: 0,
          }),
          ext: new StellarSdk.xdr.SorobanTransactionDataExt(0),
          resourceFee: StellarSdk.xdr.Int64.fromString("0"),
        }),
      ),
      minResourceFee: "0",
      events: [],
      cost: { cpuInsns: "0", memBytes: "0" },
      result: {
        auth: [],
        retval: StellarSdk.xdr.ScVal.scvVoid(),
      },
    } as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
  }

  it("builds, simulates, signs, and submits the donate invocation and returns the tx hash", async () => {
    const { deps, simulateTransaction, sendTransaction, signWalletTransaction } = makeDeps();
    simulateTransaction.mockResolvedValue(successSim());
    signWalletTransaction.mockResolvedValue({
      signedTxXdr: buildSignedTxXdr(),
      signerAddress: DONOR_ADDRESS,
    });
    sendTransaction.mockResolvedValue({ status: "PENDING", hash: TX_HASH });

    const { donateOnChain } = await import("@/lib/donations/donate");
    const result = await donateOnChain(
      {
        donorAddress: DONOR_ADDRESS,
        handleHash: HANDLE_HASH,
        token: TOKEN,
        amount: AMOUNT,
        donationIdHash: DONATION_ID_HASH,
      },
      deps,
    );
    expect(result).toEqual({ status: "PENDING", hash: TX_HASH });
    expect(simulateTransaction).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledOnce();
    // The signed tx passed to sendTransaction must parse and have the donate op.
    const sent = sendTransaction.mock.calls[0][0] as StellarSdk.Transaction;
    expect(sent.source).toBe(DONOR_ADDRESS);
  });

  it("throws DonateError with code 'Paused' when simulate returns a Paused error", async () => {
    const { deps, simulateTransaction } = makeDeps();
    // Soroban simulate errors carry `error: "..."` with the contract error name.
    simulateTransaction.mockResolvedValue({
      id: "x",
      latestLedger: 1,
      error: "Error(Paused)",
      result: undefined,
    } as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse);
    const { donateOnChain, DonateError } = await import("@/lib/donations/donate");
    await expect(
      donateOnChain(
        {
          donorAddress: DONOR_ADDRESS,
          handleHash: HANDLE_HASH,
          token: TOKEN,
          amount: AMOUNT,
          donationIdHash: DONATION_ID_HASH,
        },
        deps,
      ),
    ).rejects.toMatchObject({ name: "DonateError", code: "Paused" });
    void DonateError;
  });

  it("throws DonateError with code 'TokenNotAllowed' when simulate returns that error", async () => {
    const { deps, simulateTransaction } = makeDeps();
    simulateTransaction.mockResolvedValue({
      id: "x",
      latestLedger: 1,
      error: "Error(TokenNotAllowed)",
      result: undefined,
    } as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse);
    const { donateOnChain } = await import("@/lib/donations/donate");
    await expect(
      donateOnChain(
        {
          donorAddress: DONOR_ADDRESS,
          handleHash: HANDLE_HASH,
          token: TOKEN,
          amount: AMOUNT,
          donationIdHash: DONATION_ID_HASH,
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "TokenNotAllowed" });
  });

  it("throws DonateError with code 'send_failed' when sendTransaction returns ERROR", async () => {
    const { deps, simulateTransaction, sendTransaction, signWalletTransaction } = makeDeps();
    simulateTransaction.mockResolvedValue(successSim());
    signWalletTransaction.mockResolvedValue({
      signedTxXdr: buildSignedTxXdr(),
      signerAddress: DONOR_ADDRESS,
    });
    // Build a real error result XDR so the decoder path runs.
    const errResult = new StellarSdk.xdr.TransactionResult({
      feeCharged: StellarSdk.xdr.Int64.fromString("100"),
      result: StellarSdk.xdr.TransactionResultResult.txFailed([]),
      ext: new StellarSdk.xdr.TransactionResultExt(0),
    });
    sendTransaction.mockResolvedValue({
      status: "ERROR",
      hash: TX_HASH,
      errorResult: errResult,
    });
    const { donateOnChain } = await import("@/lib/donations/donate");
    await expect(
      donateOnChain(
        {
          donorAddress: DONOR_ADDRESS,
          handleHash: HANDLE_HASH,
          token: TOKEN,
          amount: AMOUNT,
          donationIdHash: DONATION_ID_HASH,
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "send_failed" });
  });

  it("throws when the signer address does not match the donor", async () => {
    const { deps, simulateTransaction, signWalletTransaction } = makeDeps();
    simulateTransaction.mockResolvedValue(successSim());
    signWalletTransaction.mockResolvedValue({
      signedTxXdr: buildSignedTxXdr(),
      signerAddress: StellarSdk.Keypair.random().publicKey(),
    });
    const { donateOnChain } = await import("@/lib/donations/donate");
    await expect(
      donateOnChain(
        {
          donorAddress: DONOR_ADDRESS,
          handleHash: HANDLE_HASH,
          token: TOKEN,
          amount: AMOUNT,
          donationIdHash: DONATION_ID_HASH,
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "signer_mismatch" });
  });

  it("delegates to window.__STARTIP_DONATE_STUB__ when present", async () => {
    const donateOnChainStub = vi.fn(async () => ({ status: "PENDING", hash: "stub-hash" }));
    (globalThis.window as unknown as Record<string, unknown>).__STARTIP_DONATE_STUB__ = {
      donateOnChain: donateOnChainStub,
    };
    const { deps, simulateTransaction } = makeDeps();
    const { donateOnChain } = await import("@/lib/donations/donate");
    const result = await donateOnChain(
      {
        donorAddress: DONOR_ADDRESS,
        handleHash: HANDLE_HASH,
        token: TOKEN,
        amount: AMOUNT,
        donationIdHash: DONATION_ID_HASH,
      },
      deps,
    );
    expect(result).toEqual({ status: "PENDING", hash: "stub-hash" });
    expect(donateOnChainStub).toHaveBeenCalledOnce();
    expect(simulateTransaction).not.toHaveBeenCalled();
  });
});

describe("decodeDonateError", () => {
  it("maps each typed contract error name to its UI message key", async () => {
    const { decodeDonateError } = await import("@/lib/donations/donate");
    expect(decodeDonateError("Error(Unauthorized)")).toBe("Unauthorized");
    expect(decodeDonateError("Error(Paused)")).toBe("Paused");
    expect(decodeDonateError("Error(CreatorNotFound)")).toBe("CreatorNotFound");
    expect(decodeDonateError("Error(CreatorInactive)")).toBe("CreatorInactive");
    expect(decodeDonateError("Error(InvalidAmount)")).toBe("InvalidAmount");
    expect(decodeDonateError("Error(TokenNotAllowed)")).toBe("TokenNotAllowed");
    expect(decodeDonateError("Error(FeeCapExceeded)")).toBe("FeeCapExceeded");
  });

  it("returns 'unknown' for an unrecognized error string", async () => {
    const { decodeDonateError } = await import("@/lib/donations/donate");
    expect(decodeDonateError("something else")).toBe("unknown");
    expect(decodeDonateError("")).toBe("unknown");
  });
});
