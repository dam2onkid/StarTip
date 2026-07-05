// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Onboarding register helpers. The tx-building + submit path is exercised with
 * a mocked RPC and a mocked wallet kit; the pure `payoutAddressWarning` is
 * tested directly.
 *
 * `StellarSdk.rpc.assembleTransaction` is a standalone function on an ESM
 * namespace (not configurable), so it is overridden via `vi.mock` with
 * `importOriginal` spreading the real SDK and replacing only that one export.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const TREASURY = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const OWNER = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
// A real, checksum-valid Stellar public key for the payout argument.
const PAYOUT = StellarSdk.Keypair.random().publicKey();

const { assembleTransactionMock } = vi.hoisted(() => ({
  assembleTransactionMock: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...real,
    rpc: { ...real.rpc, assembleTransaction: assembleTransactionMock },
  };
});

vi.mock("@/lib/stellar/client", () => ({
  contractId: CONTRACT_ID,
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
}));

const signWalletTransaction = vi.fn();
vi.mock("@/lib/wallet/kit", () => ({
  signWalletTransaction,
}));

/** A real, parseable transaction XDR for the wallet stub to "sign". The
 * register helper re-parses the signed XDR before submitting, so the stub must
 * return something `TransactionBuilder.fromXDR` can read. `sendTransaction` is
 * mocked, so signature validity is never checked. */
function realTxXdr(): string {
  const account = new StellarSdk.Account(
    "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
    "123",
  );
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: "Test SDF Network ; September 2015",
  })
    .addOperation(StellarSdk.Operation.accountMerge({ destination: account.accountId() }))
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

const SIGNED_XDR = realTxXdr();

// `StellarSdk.rpc.assembleTransaction` is a standalone function (not a method
// on the server instance). Spy on it so the test controls the assembled tx
// without running the real assembler against a stub simulation response.
const assembledBuilder = {
  build: () => ({
    toXDR: () => SIGNED_XDR,
    hash: () => "deadbeef",
  }),
};
let assembleSpy: ReturnType<typeof vi.spyOn> | undefined;

function mockRpc(opts: {
  account?: StellarSdk.Account;
  simError?: boolean;
  sendStatus?: string;
  sendHash?: string;
}) {
  // `isSimulationError` checks `"error" in sim` (key presence), so the error
  // key must be entirely absent on success.
  const simSuccess = {
    id: "sim-1",
    latestLedger: 1,
    original: "",
    events: [],
    result: { retval: StellarSdk.xdr.ScVal.scvVoid() },
    transactionData: "tx-data",
  };
  const rpc = {
    getAccount: vi.fn(async () =>
      opts.account ??
      new StellarSdk.Account(
        "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        "123",
      ),
    ),
    simulateTransaction: vi.fn(async () =>
      opts.simError ? { id: "sim", latestLedger: 1, error: "simulate failed" } : simSuccess,
    ),
    sendTransaction: vi.fn(async () => ({
      status: opts.sendStatus ?? "PENDING",
      hash: opts.sendHash ?? "txhash",
      errorResult: undefined,
    })),
  };
  return rpc;
}

describe("payoutAddressWarning", () => {
  it("returns null for an ordinary payout address", async () => {
    const { payoutAddressWarning } = await import("@/lib/onboarding/register");
    expect(
      payoutAddressWarning("GABCDE...", { contractId: CONTRACT_ID, treasuryAddress: TREASURY }),
    ).toBeNull();
  });

  it("returns 'contract' when the payout equals the contract id", async () => {
    const { payoutAddressWarning } = await import("@/lib/onboarding/register");
    expect(
      payoutAddressWarning(CONTRACT_ID, { contractId: CONTRACT_ID, treasuryAddress: TREASURY }),
    ).toBe("contract");
  });

  it("returns 'treasury' when the payout equals the treasury address", async () => {
    const { payoutAddressWarning } = await import("@/lib/onboarding/register");
    expect(
      payoutAddressWarning(TREASURY, { contractId: CONTRACT_ID, treasuryAddress: TREASURY }),
    ).toBe("treasury");
  });

  it("returns null when treasury is unknown and payout is not the contract", async () => {
    const { payoutAddressWarning } = await import("@/lib/onboarding/register");
    expect(
      payoutAddressWarning("GABCDE...", { contractId: CONTRACT_ID, treasuryAddress: null }),
    ).toBeNull();
  });
});

describe("registerCreatorOnChain", () => {
  beforeEach(() => {
    signWalletTransaction.mockReset();
    assembleTransactionMock.mockReset();
    assembleTransactionMock.mockReturnValue(assembledBuilder);
  });

  afterEach(() => {
    assembleTransactionMock.mockReset();
  });

  it("builds, signs, and submits register_creator and returns the tx hash", async () => {
    const rpc = mockRpc({});
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR,
      signerAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
    });
    const { registerCreatorOnChain } = await import("@/lib/onboarding/register");

    const res = await registerCreatorOnChain({
      ownerAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      handle: "ada",
      payoutAddress: PAYOUT,
    });
    expect(res.status).toBe("PENDING");
    expect(res.hash).toBe("txhash");
    expect(rpc.getAccount).toHaveBeenCalledWith(
      "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
    );
    expect(rpc.simulateTransaction).toHaveBeenCalled();
    expect(signWalletTransaction).toHaveBeenCalledWith(SIGNED_XDR);
    expect(rpc.sendTransaction).toHaveBeenCalled();
  });

  it("throws when the simulation errors", async () => {
    const rpc = mockRpc({ simError: true });
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    const { registerCreatorOnChain } = await import("@/lib/onboarding/register");
    await expect(
      registerCreatorOnChain({
        ownerAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        handle: "ada",
        payoutAddress: PAYOUT,
      }),
    ).rejects.toThrow(/simulate register_creator failed/);
  });

  it("throws when sendTransaction returns ERROR", async () => {
    const rpc = mockRpc({ sendStatus: "ERROR" });
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR });
    const { registerCreatorOnChain } = await import("@/lib/onboarding/register");
    await expect(
      registerCreatorOnChain({
        ownerAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        handle: "ada",
        payoutAddress: PAYOUT,
      }),
    ).rejects.toThrow(/register_creator failed: ERROR/);
  });

  it("throws on signerAddress mismatch", async () => {
    const rpc = mockRpc({});
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR,
      signerAddress: "GDOTHER",
    });
    const { registerCreatorOnChain } = await import("@/lib/onboarding/register");
    await expect(
      registerCreatorOnChain({
        ownerAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        handle: "ada",
        payoutAddress: PAYOUT,
      }),
    ).rejects.toThrow(/signerAddress mismatch/);
  });
});

describe("readTreasuryAddress", () => {
  it("returns the treasury address from a Some(get_config) retval", async () => {
    const configVal = StellarSdk.xdr.ScVal.scvVec([
      StellarSdk.xdr.ScVal.scvMap([
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("treasury_address"),
          val: StellarSdk.Address.fromString(TREASURY).toScVal(),
        }),
      ]),
    ]);
    const rpc = {
      simulateTransaction: vi.fn(async () => ({
        id: "sim",
        latestLedger: 1,
        original: "",
        events: [],
        result: { retval: configVal },
      })),
    };
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    const { readTreasuryAddress } = await import("@/lib/onboarding/register");
    expect(await readTreasuryAddress()).toBe(TREASURY);
  });

  it("returns null when get_config returns None (empty vec)", async () => {
    const rpc = {
      simulateTransaction: vi.fn(async () => ({
        id: "sim",
        latestLedger: 1,
        original: "",
        events: [],
        result: { retval: StellarSdk.xdr.ScVal.scvVec([]) },
      })),
    };
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    const { readTreasuryAddress } = await import("@/lib/onboarding/register");
    expect(await readTreasuryAddress()).toBeNull();
  });

  it("returns null when the simulation errors", async () => {
    const rpc = {
      simulateTransaction: vi.fn(async () => ({
        id: "sim",
        latestLedger: 1,
        original: "",
        events: [],
        error: "boom",
      })),
    };
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    const { readTreasuryAddress } = await import("@/lib/onboarding/register");
    expect(await readTreasuryAddress()).toBeNull();
  });
});
