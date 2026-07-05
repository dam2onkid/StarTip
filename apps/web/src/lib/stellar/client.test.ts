import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "@/lib/env";

describe("stellar/client", () => {
  let originalNetwork: string | undefined;

  beforeEach(() => {
    originalNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  });

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    } else {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = originalNetwork;
    }
    vi.resetModules();
  });

  it("exposes the Testnet passphrase and contract id from env", async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    const { networkPassphrase, contractId } = await import("@/lib/stellar/client");
    expect(networkPassphrase).toBe("Test SDF Network ; September 2015");
    expect(contractId).toBe(env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID);
  });

  it("exposes the Pubnet passphrase when network is pubnet", async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "pubnet";
    const { networkPassphrase } = await import("@/lib/stellar/client");
    expect(networkPassphrase).toBe("Public Global Stellar Network ; September 2015");
  });

  it("getRpc returns a cached rpc.Server bound to the testnet URL", async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    const { getRpc } = await import("@/lib/stellar/client");
    const a = getRpc();
    const b = getRpc();
    expect(a).toBe(b);
    expect(a.serverURL.toString()).toBe("https://soroban-testnet.stellar.org/");
  });
});

describe("stellarExpertAccountUrl", () => {
  let originalNetwork: string | undefined;

  beforeEach(() => {
    originalNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  });

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    } else {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = originalNetwork;
    }
    vi.resetModules();
  });

  it("returns the testnet explorer URL when the network is testnet", async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    const { stellarExpertAccountUrl } = await import("@/lib/stellar/client");
    expect(stellarExpertAccountUrl("GABC...WXYZ")).toBe(
      "https://stellar.expert/explorer/testnet/account/GABC...WXYZ",
    );
  });

  it("returns the pubnet explorer URL when the network is pubnet", async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "pubnet";
    const { stellarExpertAccountUrl } = await import("@/lib/stellar/client");
    expect(stellarExpertAccountUrl("GABC...WXYZ")).toBe(
      "https://stellar.expert/explorer/public/account/GABC...WXYZ",
    );
  });
});
