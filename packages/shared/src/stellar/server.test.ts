import { describe, it, expect, beforeAll } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

describe("stellar/server", () => {
  beforeAll(() => {
    // server.ts derives the RPC/horizon URLs from this env var. Force testnet
    // so the assertions below hold regardless of the host environment.
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
  });
  it("exports a rpc.Server instance bound to the testnet RPC URL", async () => {
    const { rpc } = await import("./server");
    expect(rpc).toBeInstanceOf(StellarSdk.rpc.Server);
    expect(rpc.serverURL.toString()).toBe("https://soroban-testnet.stellar.org/");
  });

  it("exports a Horizon.Server instance bound to the testnet horizon URL", async () => {
    const { horizon } = await import("./server");
    expect(horizon).toBeInstanceOf(StellarSdk.Horizon.Server);
    expect(horizon.serverURL.toString()).toBe("https://horizon-testnet.stellar.org/");
  });
});
