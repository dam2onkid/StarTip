// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const TOKEN_USDC = {
  contract_address: "CUSDC",
  symbol: "USDC",
  name: "USD Coin",
  issuer: null,
  decimals: 6,
  icon_url: null,
};

let tokensData: unknown = [TOKEN_USDC];
let fetchError: unknown = null;

const createBrowserClient = vi.fn(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() =>
      Promise.resolve({ data: fetchError ? null : tokensData, error: fetchError }),
    ),
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient,
}));

describe("useTokenAllowlist", () => {
  beforeEach(() => {
    tokensData = [TOKEN_USDC];
    fetchError = null;
  });

  it("returns loading then ready with tokens", async () => {
    const { useTokenAllowlist } = await import("./use-token-allowlist");
    const { result } = renderHook(() => useTokenAllowlist());

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tokens).toEqual([TOKEN_USDC]);
  });

  it("returns empty when no tokens are available", async () => {
    tokensData = [];
    const { useTokenAllowlist } = await import("./use-token-allowlist");
    const { result } = renderHook(() => useTokenAllowlist());

    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.tokens).toEqual([]);
  });

  it("returns error when the fetch fails", async () => {
    fetchError = new Error("supabase fetch failed");
    const { useTokenAllowlist } = await import("./use-token-allowlist");
    const { result } = renderHook(() => useTokenAllowlist());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.tokens).toEqual([]);
  });
});
