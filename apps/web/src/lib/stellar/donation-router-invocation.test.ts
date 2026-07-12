// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * DonationRouterInvocation tests. The module hides the full Soroban tx
 * lifecycle behind a small interface: build, simulate, assemble, sign, submit,
 * and signer-mismatch checks. A fake RPC seam and a fake signer are enough to
 * exercise every path.
 */

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const OWNER = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const PAYOUT = StellarSdk.Keypair.random().publicKey();
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const HANDLE_HASH = Buffer.alloc(32, 0xab);

function realTxXdr(): string {
  const account = new StellarSdk.Account(OWNER, "123");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.accountMerge({ destination: account.accountId() }))
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

const SIGNED_XDR = realTxXdr();

function successSim(): StellarSdk.rpc.Api.SimulateTransactionSuccessResponse {
  return {
    _parsed: true,
    id: "sim-1",
    latestLedger: 1,
    events: [],
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
    result: { auth: [], retval: StellarSdk.xdr.ScVal.scvVoid() },
  } as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
}

function makeDependencies(over: {
  simulate?: StellarSdk.rpc.Api.SimulateTransactionResponse;
  sendStatus?: string;
  signerAddress?: string;
} = {}) {
  const getAccount = vi.fn(async () => new StellarSdk.Account(OWNER, "123"));
  const simulateTransaction = vi.fn(async (_tx: StellarSdk.Transaction) => over.simulate ?? successSim());
  const sendTransaction = vi.fn(async () => ({
    status: over.sendStatus ?? "PENDING",
    hash: "txhash",
    errorResult: undefined,
  }));
  const rpc = {
    getAccount,
    simulateTransaction,
    sendTransaction,
  } as unknown as StellarSdk.rpc.Server;

  const signTransaction = vi.fn(async () => ({
    signedTxXdr: SIGNED_XDR,
    signerAddress: over.signerAddress,
  }));

  return {
    rpc,
    getAccount,
    simulateTransaction,
    sendTransaction,
    signer: { address: OWNER, signTransaction },
    networkConfig: { rpc, contractId: CONTRACT_ID, networkPassphrase: NETWORK_PASSPHRASE },
    signTransaction,
  };
}

describe("invokeDonationRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds, simulates, signs, and submits a single contract invocation", async () => {
    const { getAccount, simulateTransaction, sendTransaction, signTransaction, signer, networkConfig } =
      makeDependencies();
    const { invokeDonationRouter } = await import("@/lib/stellar/donation-router-invocation");

    const result = await invokeDonationRouter({
      method: "register_creator",
      args: [
        StellarSdk.Address.fromString(OWNER).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
        StellarSdk.Address.fromString(PAYOUT).toScVal(),
      ],
      signer,
      networkConfig,
    });

    expect(result).toEqual({ status: "PENDING", hash: "txhash" });
    expect(getAccount).toHaveBeenCalledWith(OWNER);
    expect(simulateTransaction).toHaveBeenCalledOnce();
    const simTx = simulateTransaction.mock.calls[0][0] as StellarSdk.Transaction;
    expect(simTx.operations).toHaveLength(1);
    expect(simTx.operations[0].type).toBe("invokeHostFunction");
    expect(signTransaction).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledOnce();
  });

  it("throws when the simulation errors", async () => {
    const { simulateTransaction, signer, networkConfig } = makeDependencies({
      simulate: {
        id: "sim-1",
        latestLedger: 1,
        error: "simulate failed",
      } as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse,
    });
    const { invokeDonationRouter } = await import("@/lib/stellar/donation-router-invocation");

    await expect(
      invokeDonationRouter({
        method: "register_creator",
        args: [
          StellarSdk.Address.fromString(OWNER).toScVal(),
          StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
          StellarSdk.Address.fromString(PAYOUT).toScVal(),
        ],
        signer,
        networkConfig,
      }),
    ).rejects.toThrow(/simulate register_creator failed/);
    expect(simulateTransaction).toHaveBeenCalledOnce();
  });

  it("throws on signerAddress mismatch", async () => {
    const { signTransaction, signer, networkConfig } = makeDependencies({
      signerAddress: "GDOTHER",
    });
    const { invokeDonationRouter } = await import("@/lib/stellar/donation-router-invocation");

    await expect(
      invokeDonationRouter({
        method: "update_creator_payout",
        args: [
          StellarSdk.Address.fromString(OWNER).toScVal(),
          StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
          StellarSdk.Address.fromString(PAYOUT).toScVal(),
        ],
        signer,
        networkConfig,
      }),
    ).rejects.toThrow(/signerAddress mismatch/);
    expect(signTransaction).toHaveBeenCalledOnce();
  });

  it("throws when sendTransaction returns ERROR", async () => {
    const { sendTransaction, signer, networkConfig } = makeDependencies({
      sendStatus: "ERROR",
    });
    const { invokeDonationRouter } = await import("@/lib/stellar/donation-router-invocation");

    await expect(
      invokeDonationRouter({
        method: "set_creator_active_owner",
        args: [
          StellarSdk.Address.fromString(OWNER).toScVal(),
          StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
          StellarSdk.xdr.ScVal.scvBool(true),
        ],
        signer,
        networkConfig,
      }),
    ).rejects.toThrow(/set_creator_active_owner failed: ERROR/);
    expect(sendTransaction).toHaveBeenCalledOnce();
  });

  it("supports optional pre-operations before the contract invocation", async () => {
    const { simulateTransaction, sendTransaction, signTransaction, signer, networkConfig } =
      makeDependencies();
    const { invokeDonationRouter } = await import("@/lib/stellar/donation-router-invocation");

    const issuer = StellarSdk.Keypair.random().publicKey();
    const preOp = StellarSdk.Operation.changeTrust({
      asset: new StellarSdk.Asset("USDC", issuer),
      source: OWNER,
    });

    const result = await invokeDonationRouter({
      method: "donate",
      args: [
        StellarSdk.Address.fromString(OWNER).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(HANDLE_HASH),
        StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
        new StellarSdk.ScInt(BigInt(1000000)).toI128(),
      ],
      preOperations: [preOp],
      signer,
      networkConfig,
    });

    expect(result).toEqual({ status: "PENDING", hash: "txhash" });
    expect(simulateTransaction).toHaveBeenCalledOnce();
    const simTx = simulateTransaction.mock.calls[0][0] as StellarSdk.Transaction;
    expect(simTx.operations).toHaveLength(2);
    expect(simTx.operations[0].type).toBe("changeTrust");
    expect(simTx.operations[1].type).toBe("invokeHostFunction");
    expect(signTransaction).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledOnce();
  });
});
