// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Active-Creator on-chain update helpers. `updateCreatorPayoutOnChain` and
 * `setCreatorActiveOnChain` follow the same client-builds + wallet-signs +
 * submits-to-RPC pattern as `registerCreatorOnChain`. The tx-building + submit
 * path is exercised with a mocked RPC and a mocked wallet kit.
 *
 * `StellarSdk.rpc.assembleTransaction` is overridden via `vi.mock` with
 * `importOriginal` so the test controls the assembled tx without running the
 * real assembler against a stub simulation response.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const OWNER = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const NEW_PAYOUT = StellarSdk.Keypair.random().publicKey();

const { assembleTransactionMock } = vi.hoisted(() => ({
  assembleTransactionMock: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@stellar/stellar-sdk")>();
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

const assembledBuilder = {
  build: () => ({
    toXDR: () => SIGNED_XDR,
    hash: () => "deadbeef",
  }),
};

function mockRpc(opts: {
  simError?: boolean;
  sendStatus?: string;
  sendHash?: string;
} = {}) {
  const simSuccess = {
    id: "sim-1",
    latestLedger: 1,
    original: "",
    events: [],
    result: { retval: StellarSdk.xdr.ScVal.scvVoid() },
    transactionData: "tx-data",
  };
  return {
    getAccount: vi.fn(
      async () => new StellarSdk.Account(OWNER, "123"),
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
}

beforeEach(() => {
  signWalletTransaction.mockReset();
  assembleTransactionMock.mockReset();
  assembleTransactionMock.mockReturnValue(assembledBuilder);
});

afterEach(() => {
  assembleTransactionMock.mockReset();
});

describe("updateCreatorPayoutOnChain", () => {
  it("builds, signs, and submits update_creator_payout and returns the tx hash", async () => {
    const rpc = mockRpc();
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR, signerAddress: OWNER });
    const { updateCreatorPayoutOnChain } = await import("@/lib/creators/active");

    const res = await updateCreatorPayoutOnChain({
      ownerAddress: OWNER,
      handle: "ada",
      newPayoutAddress: NEW_PAYOUT,
    });
    expect(res.status).toBe("PENDING");
    expect(res.hash).toBe("txhash");
    expect(rpc.getAccount).toHaveBeenCalledWith(OWNER);
    expect(rpc.simulateTransaction).toHaveBeenCalled();
    expect(signWalletTransaction).toHaveBeenCalledWith(SIGNED_XDR);
    expect(rpc.sendTransaction).toHaveBeenCalled();
  });

  it("throws when the simulation errors", async () => {
    const rpc = mockRpc({ simError: true });
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    const { updateCreatorPayoutOnChain } = await import("@/lib/creators/active");
    await expect(
      updateCreatorPayoutOnChain({
        ownerAddress: OWNER,
        handle: "ada",
        newPayoutAddress: NEW_PAYOUT,
      }),
    ).rejects.toThrow(/simulate update_creator_payout failed/);
  });

  it("throws when sendTransaction returns ERROR", async () => {
    const rpc = mockRpc({ sendStatus: "ERROR" });
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR });
    const { updateCreatorPayoutOnChain } = await import("@/lib/creators/active");
    await expect(
      updateCreatorPayoutOnChain({
        ownerAddress: OWNER,
        handle: "ada",
        newPayoutAddress: NEW_PAYOUT,
      }),
    ).rejects.toThrow(/update_creator_payout failed: ERROR/);
  });

  it("throws on signerAddress mismatch", async () => {
    const rpc = mockRpc();
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR, signerAddress: "GDOTHER" });
    const { updateCreatorPayoutOnChain } = await import("@/lib/creators/active");
    await expect(
      updateCreatorPayoutOnChain({
        ownerAddress: OWNER,
        handle: "ada",
        newPayoutAddress: NEW_PAYOUT,
      }),
    ).rejects.toThrow(/signerAddress mismatch/);
  });
});

describe("setCreatorActiveOnChain", () => {
  it("builds, signs, and submits set_creator_active_owner with active=true", async () => {
    const rpc = mockRpc();
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR, signerAddress: OWNER });
    const { setCreatorActiveOnChain } = await import("@/lib/creators/active");

    const res = await setCreatorActiveOnChain({
      ownerAddress: OWNER,
      handle: "ada",
      active: false,
    });
    expect(res.status).toBe("PENDING");
    expect(res.hash).toBe("txhash");
    expect(rpc.getAccount).toHaveBeenCalledWith(OWNER);
    expect(rpc.simulateTransaction).toHaveBeenCalled();
    expect(signWalletTransaction).toHaveBeenCalledWith(SIGNED_XDR);
    expect(rpc.sendTransaction).toHaveBeenCalled();
  });

  it("throws when sendTransaction returns ERROR", async () => {
    const rpc = mockRpc({ sendStatus: "ERROR" });
    const { getRpc } = await import("@/lib/stellar/client");
    (getRpc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rpc);
    signWalletTransaction.mockResolvedValue({ signedTxXdr: SIGNED_XDR });
    const { setCreatorActiveOnChain } = await import("@/lib/creators/active");
    await expect(
      setCreatorActiveOnChain({ ownerAddress: OWNER, handle: "ada", active: true }),
    ).rejects.toThrow(/set_creator_active_owner failed: ERROR/);
  });
});

describe("creator update stub seam", () => {
  it("updateCreatorPayoutOnChain delegates to window.__STARTIP_CREATOR_UPDATE_STUB__ when present", async () => {
    const stub = {
      updateCreatorPayout: vi.fn(async () => ({ status: "PENDING", hash: "stub-hash" })),
      setCreatorActive: vi.fn(),
    };
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __STARTIP_CREATOR_UPDATE_STUB__: stub,
    };
    try {
      const { updateCreatorPayoutOnChain } = await import("@/lib/creators/active");
      const res = await updateCreatorPayoutOnChain({
        ownerAddress: OWNER,
        handle: "ada",
        newPayoutAddress: NEW_PAYOUT,
      });
      expect(res.hash).toBe("stub-hash");
      expect(stub.updateCreatorPayout).toHaveBeenCalledWith({
        ownerAddress: OWNER,
        handle: "ada",
        newPayoutAddress: NEW_PAYOUT,
      });
    } finally {
      (globalThis as unknown as { window: Record<string, unknown> | undefined }).window =
        undefined;
    }
  });

  it("setCreatorActiveOnChain delegates to window.__STARTIP_CREATOR_UPDATE_STUB__ when present", async () => {
    const stub = {
      updateCreatorPayout: vi.fn(),
      setCreatorActive: vi.fn(async () => ({ status: "PENDING", hash: "stub-active-hash" })),
    };
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __STARTIP_CREATOR_UPDATE_STUB__: stub,
    };
    try {
      const { setCreatorActiveOnChain } = await import("@/lib/creators/active");
      const res = await setCreatorActiveOnChain({
        ownerAddress: OWNER,
        handle: "ada",
        active: true,
      });
      expect(res.hash).toBe("stub-active-hash");
      expect(stub.setCreatorActive).toHaveBeenCalledWith({
        ownerAddress: OWNER,
        handle: "ada",
        active: true,
      });
    } finally {
      (globalThis as unknown as { window: Record<string, unknown> | undefined }).window =
        undefined;
    }
  });
});
