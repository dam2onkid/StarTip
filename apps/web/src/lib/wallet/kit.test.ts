// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Wallet kit wrapper. The kit itself (preact, walletconnect, freighter
 * extension APIs) cannot run in jsdom, so these tests cover the two pure
 * surfaces: the test-stub delegation seam (used by Playwright E2E) and the
 * signMessage error classifier (drives the "message-incapable wallet" UI).
 *
 * The real kit init + sign path is exercised by the Playwright E2E suite via
 * the same stub seam.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

interface Stub {
  address: string;
  connect: ReturnType<typeof vi.fn>;
  signMessage: ReturnType<typeof vi.fn>;
  signTransaction: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function installStub(): Stub {
  const stub = {
    address: STUB_ADDRESS,
    connect: vi.fn(async () => ({ address: STUB_ADDRESS })),
    signMessage: vi.fn(async () => ({
      signedMessage: "deadbeef",
      signerAddress: STUB_ADDRESS,
    })),
    signTransaction: vi.fn(async () => ({
      signedTxXdr: "AAAA-sig",
      signerAddress: STUB_ADDRESS,
    })),
    disconnect: vi.fn(async () => undefined),
  };
  (window as unknown as { __STARTIP_WALLET_STUB__?: unknown; _stub?: Stub })._stub = stub;
  (window as unknown as { __STARTIP_WALLET_STUB__?: unknown }).__STARTIP_WALLET_STUB__ = stub;
  return stub;
}

function clearStub() {
  (window as unknown as { __STARTIP_WALLET_STUB__?: unknown; _stub?: Stub }).__STARTIP_WALLET_STUB__ = undefined;
  (window as unknown as { __STARTIP_WALLET_STUB__?: unknown; _stub?: Stub })._stub = undefined;
}

describe("wallet kit wrapper — test-stub delegation", () => {
  beforeEach(() => {
    vi.resetModules();
    installStub();
  });
  afterEach(() => {
    clearStub();
  });

  it("connectWallet delegates to the stub connect()", async () => {
    const { connectWallet } = await import("@/lib/wallet/kit");
    const res = await connectWallet();
    expect(res.address).toBe(STUB_ADDRESS);
  });

  it("getWalletAddress returns the stub address without invoking the kit", async () => {
    const { getWalletAddress } = await import("@/lib/wallet/kit");
    const addr = await getWalletAddress();
    expect(addr).toBe(STUB_ADDRESS);
  });

  it("signWalletMessage delegates to the stub and forwards the challenge", async () => {
    const { signWalletMessage } = await import("@/lib/wallet/kit");
    const out = await signWalletMessage("StarTip wallet link\nHandle: foo");
    expect(out.signedMessage).toBe("deadbeef");
    expect(out.signerAddress).toBe(STUB_ADDRESS);
  });

  it("signWalletTransaction delegates to the stub signTransaction", async () => {
    const { signWalletTransaction } = await import("@/lib/wallet/kit");
    const out = await signWalletTransaction("AAAA-xdr");
    expect(out.signedTxXdr).toBe("AAAA-sig");
    expect(out.signerAddress).toBe(STUB_ADDRESS);
  });

  it("disconnectWallet delegates to the stub disconnect()", async () => {
    const { disconnectWallet } = await import("@/lib/wallet/kit");
    await disconnectWallet();
    // Re-import to read the stub; the stub's disconnect was called.
    const stub = (window as unknown as { _stub: Stub })._stub;
    expect(stub.disconnect).toHaveBeenCalled();
  });
});

describe("classifySignMessageError", () => {
  it("returns 'unsupported' for a kit error whose message indicates signMessage is not supported", async () => {
    const { classifySignMessageError } = await import("@/lib/wallet/kit");
    expect(
      classifySignMessageError(new Error("This wallet does not support signMessage")),
    ).toBe("unsupported");
    expect(
      classifySignMessageError(new Error("Method signMessage not implemented")),
    ).toBe("unsupported");
  });

  it("returns 'unknown' for unrelated errors", async () => {
    const { classifySignMessageError } = await import("@/lib/wallet/kit");
    expect(classifySignMessageError(new Error("user rejected"))).toBe("unknown");
    expect(classifySignMessageError(new Error("network down"))).toBe("unknown");
  });
});
