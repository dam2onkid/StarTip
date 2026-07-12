// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const donorHasTrustline = vi.fn(async () => true);
vi.mock("@/lib/donations/trustline-check", () => ({
  donorHasTrustline,
}));

vi.mock("@/lib/stellar/client", () => ({
  getRpc: vi.fn(() => ({ rpc: true })),
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "C-TEST-CONTRACT",
}));

const TOKEN_USDC = {
  contract_address: "CUSDC",
  symbol: "USDC",
  name: "USD Coin",
  issuer: null,
  decimals: 6,
  icon_url: null,
};

describe("useTrustline", () => {
  beforeEach(() => {
    donorHasTrustline.mockReset();
  });

  it("returns null when no wallet is connected", async () => {
    const { useTrustline } = await import("./use-trustline");
    const { result } = renderHook(() => useTrustline(null, TOKEN_USDC));

    expect(result.current).toBe(null);
    expect(donorHasTrustline).not.toHaveBeenCalled();
  });

  it("returns null when no token is selected", async () => {
    const { useTrustline } = await import("./use-trustline");
    const { result } = renderHook(() => useTrustline("GADDR", null));

    expect(result.current).toBe(null);
    expect(donorHasTrustline).not.toHaveBeenCalled();
  });

  it("returns true when the donor has a trustline", async () => {
    donorHasTrustline.mockResolvedValue(true);
    const { useTrustline } = await import("./use-trustline");
    const { result } = renderHook(() => useTrustline("GADDR", TOKEN_USDC));

    await waitFor(() => expect(result.current).toBe(true));
    expect(donorHasTrustline).toHaveBeenCalledWith({ rpc: true }, "GADDR", TOKEN_USDC);
  });

  it("returns false when the donor lacks a trustline", async () => {
    donorHasTrustline.mockResolvedValue(false);
    const { useTrustline } = await import("./use-trustline");
    const { result } = renderHook(() => useTrustline("GADDR", TOKEN_USDC));

    await waitFor(() => expect(result.current).toBe(false));
  });
});
