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
const getWalletAddress = vi.fn();
const signWalletTransaction = vi.fn();

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  getWalletAddress,
  signWalletTransaction,
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
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
    unknown: "An unexpected error occurred.",
  },
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

const PREPARE_RESPONSE = {
  donation_id: "00000000-0000-0000-0000-000000000001",
  donation_id_hash: "ab".repeat(32),
  contract_id: "C-TEST-CONTRACT",
  handle_hash: "cd".repeat(32),
  token_allowlist: [TOKEN_USDC],
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
  getWalletAddress.mockReset();
  signWalletTransaction.mockReset();
  donateOnChain.mockReset();
  tokensData = [TOKEN_USDC];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderAndConnect(handle = "ada") {
  const { DonateForm } = await import("./donate-form");
  connectWallet.mockResolvedValue(undefined);
  getWalletAddress.mockResolvedValue(STUB_ADDRESS);
  render(<DonateForm handle={handle} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
  });
  await waitFor(() => expect(screen.getByText(/Connected:/i)).toBeInTheDocument());
  // Wait for the token picker to be populated by the useEffect.
  await waitFor(() => expect(screen.getByRole("option", { name: /USDC/i })).toBeInTheDocument());
}

describe("DonateForm", () => {
  it("renders the connect wallet button when no wallet is connected", async () => {
    const { DonateForm } = await import("./donate-form");
    render(<DonateForm handle="ada" />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("connects the wallet and shows the truncated address", async () => {
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

  it("completes the full prepare -> submit -> confirm flow and shows success", async () => {
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([
      () => jsonRes(200, PREPARE_RESPONSE),
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
  });

  it("surfaces a Paused error from the donate pipeline as a user-facing message", async () => {
    donateOnChain.mockRejectedValue(new DonateError("Paused"));
    mockFetch([() => jsonRes(200, PREPARE_RESPONSE)]);
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

  it("surfaces a prepare API error (creator_paused)", async () => {
    mockFetch([() => jsonRes(409, { error: "creator_paused" })]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/creator_paused/i);
    });
  });

  it("surfaces a confirm API error", async () => {
    donateOnChain.mockResolvedValue({ status: "PENDING", hash: "deadbeef".repeat(8) });
    mockFetch([
      () => jsonRes(200, PREPARE_RESPONSE),
      () => jsonRes(409, { error: "donation_id_hash_mismatch" }),
    ]);
    await renderAndConnect();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /donate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/donation_id_hash_mismatch/i);
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
