import { describe, it, expect } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

describe("stellar/server", () => {
  it("exports a rpc.Server instance bound to the testnet RPC URL", async () => {
    const { rpc } = await import("@/lib/stellar/server");
    expect(rpc).toBeInstanceOf(StellarSdk.rpc.Server);
    expect(rpc.serverURL.toString()).toBe("https://soroban-testnet.stellar.org/");
  });

  it("exports a Horizon.Server instance bound to the testnet horizon URL", async () => {
    const { horizon } = await import("@/lib/stellar/server");
    expect(horizon).toBeInstanceOf(StellarSdk.Horizon.Server);
    expect(horizon.serverURL.toString()).toBe("https://horizon-testnet.stellar.org/");
  });
});
