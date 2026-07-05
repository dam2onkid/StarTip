// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

/**
 * Extract the contract method name from a simulated transaction built by
 * `Contract.call(method)`. The first operation is an `invokeHostFunction` whose
 * `InvokeContractArgs.functionName` is the method symbol.
 */
function methodName(tx: StellarSdk.Transaction): string {
  const op = tx.operations[0] as unknown as {
    func: StellarSdk.xdr.HostFunction;
  };
  const args = op.func.invokeContract();
  const fn = args.functionName();
  return Buffer.isBuffer(fn) ? fn.toString("utf8") : (fn as string);
}

function okResult(retval: StellarSdk.xdr.ScVal): StellarSdk.rpc.Api.SimulateTransactionSuccessResponse {
  return {
    id: "sim-id",
    latestLedger: 1,
    events: [],
    _parsed: true,
    transactionData: {},
    minResourceFee: "0",
    result: { auth: [], retval },
  } as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
}

function errorResult(message: string): StellarSdk.rpc.Api.SimulateTransactionErrorResponse {
  return {
    id: "sim-id",
    latestLedger: 1,
    events: [],
    _parsed: true,
    error: message,
  } as unknown as StellarSdk.rpc.Api.SimulateTransactionErrorResponse;
}

describe("stellar/token", () => {
  it("reads symbol, name, decimals, and issuer from a SAC contract via simulation", async () => {
    const rpc = {
      simulateTransaction: vi.fn(async (tx: StellarSdk.Transaction) => {
        switch (methodName(tx)) {
          case "symbol":
            return okResult(StellarSdk.xdr.ScVal.scvString("USDC"));
          case "name":
            return okResult(StellarSdk.xdr.ScVal.scvString("USD Coin"));
          case "decimals":
            return okResult(StellarSdk.xdr.ScVal.scvU32(6));
          case "issuer":
            return okResult(
              StellarSdk.Address.fromString(
                "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
              ).toScVal(),
            );
          default:
            throw new Error(`unexpected method ${methodName(tx)}`);
        }
      }),
    };

    const { readTokenMetadata } = await import("./token");
    const meta = await readTokenMetadata(
      rpc as unknown as StellarSdk.rpc.Server,
      "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      NETWORK_PASSPHRASE,
    );

    expect(meta).toEqual({
      contractAddress: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      symbol: "USDC",
      name: "USD Coin",
      issuer: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      decimals: 6,
    });
    // One simulation per field, including issuer.
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(4);
  });

  it("leaves issuer null when the contract does not expose issuer()", async () => {
    const rpc = {
      simulateTransaction: vi.fn(async (tx: StellarSdk.Transaction) => {
        switch (methodName(tx)) {
          case "symbol":
            return okResult(StellarSdk.xdr.ScVal.scvString("FOO"));
          case "name":
            return okResult(StellarSdk.xdr.ScVal.scvString("Foo Token"));
          case "decimals":
            return okResult(StellarSdk.xdr.ScVal.scvU32(7));
          case "issuer":
            return errorResult("function not found");
          default:
            throw new Error(`unexpected method ${methodName(tx)}`);
        }
      }),
    };

    const { readTokenMetadata } = await import("./token");
    const meta = await readTokenMetadata(
      rpc as unknown as StellarSdk.rpc.Server,
      "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      NETWORK_PASSPHRASE,
    );

    expect(meta).toMatchObject({ symbol: "FOO", name: "Foo Token", decimals: 7, issuer: null });
  });

  it("throws when a required field (symbol) simulation errors", async () => {
    const rpc = {
      simulateTransaction: vi.fn(async (tx: StellarSdk.Transaction) => {
        if (methodName(tx) === "symbol") return errorResult("no such contract");
        return okResult(StellarSdk.xdr.ScVal.scvString("x"));
      }),
    };

    const { readTokenMetadata } = await import("./token");
    await expect(
      readTokenMetadata(
        rpc as unknown as StellarSdk.rpc.Server,
        "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
        NETWORK_PASSPHRASE,
      ),
    ).rejects.toThrow(/symbol/);
  });
});
