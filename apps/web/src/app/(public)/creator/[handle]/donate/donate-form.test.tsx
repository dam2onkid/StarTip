// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * DonateForm unit tests. The wallet kit, donate pipeline, supabase browser
 * client, and fetch are mocked so each phase of the flow can be exercised in
 * isolation.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.fn();
const disconnectWallet = vi.fn();
const signWalletTransaction = vi.fn();

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  disconnectWallet,
  signWalletTransaction,
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
  stellarExpertAccountUrl: vi.fn(
    (address: string) => `https://stellar.expert/explorer/testnet/account/${address}`,
  ),
}));

const donateOnChain = vi.fn();
const DonateError = vi.hoisted(() => {
  return class DonateError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = "DonateError";
      this.code = code;
    }
  };
});

vi.mock("@/lib/donations/donate", () => ({
  donateOnChain,
  DonateError,
  DONATE_ERROR_MESSAGES: {
    Paused: "This creator is currently paused and cannot receive donations.",
    TokenNotAllowed: "This token is not in the allowed list.",
    send_failed: "The transaction was rejected by the network.",
    simulate_failed: "The transaction simulation failed.",
    trustline_failed:
      "Could not establish a trustline to this token. Please try again or pick another token.",
    unknown: "An unexpected error occurred.",
  },
}));

// Trustline lookup mock: the donate form calls donorHasTrustline before
// building donate() to decide whether a change_trust op is needed. Default
// returns true (existing trustline) so the donate-only path is exercised;
// individual tests override it to false to exercise the two-op guidance.
const donorHasTrustline = vi.fn(async () => true);
vi.mock("@/lib/donations/trustline-check", () => ({
  donorHasTrustline,
}));

vi.mock("@/lib/creators/handle-shared", () => ({
  handleHashBuffer: vi.fn(() => Buffer.alloc(32, 0xab)),
}));

// Supabase browser client mock: the token picker reads from `tokens` on mount.
let tokensData: unknown = [];
const supabaseFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    then: vi.fn((cb: (r: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(cb({ data: tokensData, error: null })),
    ),
  })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({ from: supabaseFrom })),
}));

const TOKEN_USDC = {
  contract_address: "CUSDC",
  symbol: "USDC",
  name: "USD Coin",
  issuer: null,
  decimals: 6,
  icon_url: null,
};

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const next = calls.shift();
    if (!next) throw new Error(`unexpected fetch ${url.toString()}`);
    return next(url.toString(), init);
  }) as unknown as typeof fetch;
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  connectWallet.mockReset();
  disconnectWallet.mockReset();
  signWalletTransaction.mockReset();
  donateOnChain.mockReset();
  donorHasTrustline.mockReset();
  donorHasTrustline.mockResolvedValue(true);
  tokensData = [TOKEN_USDC];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderAndConnect(handle = "ada") {
  const { DonateWalletProvider } = await import("@/components/landing/donate-wallet-context");
  const { DonateWalletConnector } = await import("@/components/landing/donate-wallet-connector");
  const { DonateForm } = await import("./donate-form");
  connectWallet.mockResolvedValue({ address: STUB_ADDRESS });
  render(
    <DonateWalletProvider>
      <DonateWalletConnector />
      <DonateForm handle={handle} />
    </DonateWalletProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
  });
  await waitFor(() => expect(screen.getByText(/Connected:/i)).toBeInTheDocument());
  // Wait for the token picker to be populated by the useEffect.
  await waitFor(() => expect(screen.getByRole("option", { name: /USDC/i })).toBeInTheDocument());
}

describe("DonateForm", () => {
  it("points donors to the navbar wallet connector when no wallet is connected", async () => {
    const { DonateWalletProvider } = await import("@/components/landing/donate-wallet-context");
    const { DonateForm } = await import("./donate-form");
    render(
      <DonateWalletProvider>
        <DonateForm handle="ada" />
      </DonateWalletProvider>,
    );
    expect(
      screen.getByText(/connect your wallet from the navbar/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect wallet/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the navbar-connected wallet address", async () => {
    await renderAndConnect();
    expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
  });

  it("renders the token picker, amount, and donate button after connecting", async () => {
    await renderAndConnect();
    expect(screen.getByRole("option", { name: /USDC/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Anonymous")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /donate/i })).toBeInTheDocument();
  });

  it("keeps the token select visible when no donation tokens are available", async () => {
    tokensData = [];
    const { DonateWalletProvider } = await import("@/components/landing/donate-wallet-context");
    const { DonateForm } = await import("./donate-form");
    render(
      <DonateWalletProvider>
        <DonateForm handle="ada" />
      </DonateWalletProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /no donation tokens available/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("combobox", { name: /token/i })).toBeDisabled();
  });

  it("completes the full submit -> verify flow and shows success", async () => {
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([
      () => jsonRes(200, { status: "confirmed" }),
    ]);
    await renderAndConnect();

    // Enter amount and submit.
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.5" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/donation confirmed/i)).toBeInTheDocument();
    });
    expect(donateOnChain).toHaveBeenCalledOnce();
    // The verify body carries tx_hash + off-chain content, no donation_id.
    const verifyCall = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(
      (c) => c[0].includes("/api/donations/verify"),
    );
    expect(verifyCall).toBeDefined();
    const verifyBody = JSON.parse(verifyCall![1].body as string);
    expect(verifyBody.tx_hash).toBe("deadbeef".repeat(8));
    expect(verifyBody.donation_id).toBeUndefined();
    expect(verifyBody.donation_id_hash).toBeUndefined();
  });

  it("surfaces a Paused error from the donate pipeline as a user-facing message", async () => {
    donateOnChain.mockRejectedValue(new DonateError("Paused"));
    mockFetch([() => jsonRes(200, { status: "confirmed" })]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /paused and cannot receive donations/i,
      );
    });
  });

  it("surfaces a verify API error (creator_not_found)", async () => {
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([() => jsonRes(409, { error: "creator_not_found" })]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/creator_not_found/i);
    });
  });

  it("surfaces a verify API error (tx_failed)", async () => {
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([() => jsonRes(409, { error: "tx_failed" })]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/tx_failed/i);
    });
  });

  it("renders quick-select buttons (1, 5, 10) alongside the custom amount field", async () => {
    await renderAndConnect();
    expect(screen.getByRole("button", { name: /^1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^5$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^10$/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
  });

  it("sets the custom amount and highlights a quick-select button when tapped", async () => {
    await renderAndConnect();
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    const btn5 = screen.getByRole("button", { name: /^5$/ });
    const btn10 = screen.getByRole("button", { name: /^10$/ });

    await act(async () => {
      fireEvent.click(btn5);
    });
    expect(amountInput.value).toBe("5");
    expect(btn5).toHaveAttribute("aria-pressed", "true");
    expect(btn10).toHaveAttribute("aria-pressed", "false");

    // Tapping 10 swaps the highlight.
    await act(async () => {
      fireEvent.click(btn10);
    });
    expect(amountInput.value).toBe("10");
    expect(btn10).toHaveAttribute("aria-pressed", "true");
    expect(btn5).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the quick-select highlight when the custom field is edited", async () => {
    await renderAndConnect();
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    const btn5 = screen.getByRole("button", { name: /^5$/ });

    await act(async () => {
      fireEvent.click(btn5);
    });
    expect(btn5).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.change(amountInput, { target: { value: "7.5" } });
    });
    expect(amountInput.value).toBe("7.5");
    expect(btn5).toHaveAttribute("aria-pressed", "false");
  });

  it("shows trustline guidance when the Donor lacks a trustline to the selected token", async () => {
    donorHasTrustline.mockResolvedValue(false);
    await renderAndConnect();
    await waitFor(() =>
      expect(
        screen.getByText(/trustline to this token is required/i),
      ).toBeInTheDocument(),
    );
  });

  it("does not show trustline guidance when the Donor already has a trustline", async () => {
    donorHasTrustline.mockResolvedValue(true);
    await renderAndConnect();
    await waitFor(() =>
      expect(
        screen.queryByText(/trustline to this token is required/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("passes needsTrustline + trustlineToken to donateOnChain when a trustline is missing", async () => {
    donorHasTrustline.mockResolvedValue(false);
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([
      () => jsonRes(200, { status: "confirmed" }),
    ]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => expect(donateOnChain).toHaveBeenCalledOnce());
    const passedArgs = donateOnChain.mock.calls[0][0] as {
      needsTrustline?: boolean;
      trustlineToken?: { symbol: string };
    };
    expect(passedArgs.needsTrustline).toBe(true);
    expect(passedArgs.trustlineToken?.symbol).toBe("USDC");
  });

  it("omits needsTrustline when the Donor already has a trustline", async () => {
    donorHasTrustline.mockResolvedValue(true);
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([
      () => jsonRes(200, { status: "confirmed" }),
    ]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => expect(donateOnChain).toHaveBeenCalledOnce());
    const passedArgs = donateOnChain.mock.calls[0][0] as {
      needsTrustline?: boolean;
    };
    expect(passedArgs.needsTrustline).toBeFalsy();
  });

  it("surfaces a trustline_failed error from the donate pipeline", async () => {
    donorHasTrustline.mockResolvedValue(false);
    donateOnChain.mockRejectedValue(new DonateError("trustline_failed"));
    mockFetch([() => jsonRes(200, { status: "confirmed" })]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not establish a trustline/i,
      );
    });
  });

});

describe("displayToRawAmount", () => {
  it("converts display units to raw i128 using decimals", async () => {
    const { displayToRawAmount } = await import("./donate-form");
    expect(displayToRawAmount("1", 6)).toBe("1000000");
    expect(displayToRawAmount("1.5", 6)).toBe("1500000");
    expect(displayToRawAmount("0.01", 6)).toBe("10000");
    expect(displayToRawAmount("100", 7)).toBe("1000000000");
    expect(displayToRawAmount("", 6)).toBe("0");
    expect(displayToRawAmount("0", 6)).toBe("0");
  });
});
