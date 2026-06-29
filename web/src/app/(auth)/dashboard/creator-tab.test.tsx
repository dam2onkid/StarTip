// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { CreatorProfile } from "@/app/(auth)/dashboard/creator-tab";

/**
 * Creator tab four-gate state machine. The wallet kit, fetch, and on-chain
 * register helpers are mocked so each gate can be exercised in isolation. The
 * Realtime flip is driven through a captured subscription callback.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.fn();
const getWalletAddress = vi.fn();
const signWalletMessage = vi.fn();
const classifySignMessageError = vi.fn((): "unsupported" | "unknown" => "unknown");
const registerCreatorOnChain = vi.fn();
const readTreasuryAddress = vi.fn(async () => null);
const payoutAddressWarning = vi.fn((): "contract" | "treasury" | null => null);

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  getWalletAddress,
  signWalletMessage,
  classifySignMessageError,
}));

vi.mock("@/lib/onboarding/register", () => ({
  registerCreatorOnChain,
  readTreasuryAddress,
  payoutAddressWarning,
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
}));

// Realtime: capture the postgres_changes callback so the test can flip
// onchain_registered, and expose removeChannel for cleanup.
let realtimeCb: ((payload: { new: Record<string, unknown> }) => void) | null = null;
const removeChannel = vi.fn();
const channelOn = vi.fn(function (this: unknown, _event: string, _filter: unknown, cb: (p: { new: Record<string, unknown> }) => void) {
  realtimeCb = cb;
  return this;
});
const subscribe = vi.fn(function (this: unknown) {
  return this;
});

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: channelOn,
      subscribe,
    })),
    removeChannel,
  })),
}));

function profile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: "p1",
    handle: null,
    owner_address: null,
    onchain_registered: false,
    ...over,
  };
}

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
  realtimeCb = null;
  connectWallet.mockReset();
  getWalletAddress.mockReset();
  signWalletMessage.mockReset();
  registerCreatorOnChain.mockReset();
  readTreasuryAddress.mockReset().mockResolvedValue(null);
  payoutAddressWarning.mockReset().mockReturnValue(null);
  removeChannel.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreatorTab — gate rendering", () => {
  it("renders the Become a Creator affordance at profile_pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={profile()} />);
    expect(screen.getByRole("button", { name: /become a creator/i })).toBeInTheDocument();
    // Stepper shows four gates.
    expect(screen.getByText("Handle")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders the wallet link gate at wallet_pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={profile({ handle: "ada" })} />);
    expect(screen.getByText(/Link your Stellar wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("renders the on-chain register gate at onchain_pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    expect(screen.getByRole("button", { name: /register on-chain/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("G…")).toBeInTheDocument();
  });

  it("renders the active gate when onchain_registered is true", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(
      <CreatorTab
        profile={profile({
          handle: "ada",
          owner_address: STUB_ADDRESS,
          onchain_registered: true,
        })}
      />,
    );
    expect(screen.getByText(/Creator is active/i)).toBeInTheDocument();
  });
});

describe("CreatorTab — gate 1 claim handle", () => {
  it("opens the claim form, runs dryRun availability, then claims on submit", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    // dryRun availability (200 available), then real claim (200 with handle).
    mockFetch([
      () => jsonRes(200, { available: true, handle: "ada" }),
      () => jsonRes(200, { handle: "ada", handle_hash: "ab".repeat(32) }),
    ]);
    render(<CreatorTab profile={profile()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /become a creator/i }));
    });
    const input = screen.getByPlaceholderText("ada-lovelace");
    await act(async () => {
      fireEvent.change(input, { target: { value: "ada" } });
    });
    // dryRun availability pill appears after debounce.
    await waitFor(() => {
      expect(screen.getByText(/Handle is available/i)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Claim$/i }));
    });
    // After claiming, the wallet link gate appears.
    await waitFor(() => {
      expect(screen.getByText(/Link your Stellar wallet/i)).toBeInTheDocument();
    });
  });

  it("shows a taken pill when dryRun returns 409", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    mockFetch([() => jsonRes(409, { error: "handle_taken", reason: "offchain_taken" })]);
    render(<CreatorTab profile={profile()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /become a creator/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("ada-lovelace"), {
        target: { value: "ada" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Handle is taken/i)).toBeInTheDocument();
    });
  });
});

describe("CreatorTab — gate 2 wallet link", () => {
  it("connects, signs the challenge, and advances to onchain_pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    connectWallet.mockResolvedValue(undefined);
    getWalletAddress.mockResolvedValue(STUB_ADDRESS);
    signWalletMessage.mockResolvedValue({ signedMessage: "deadbeef", signerAddress: STUB_ADDRESS });
    // challenge, then link
    mockFetch([
      () => jsonRes(200, { challenge: "StarTip wallet link\nHandle: ada\nProfile: x\nNonce: n" }),
      () => jsonRes(200, { owner_address: STUB_ADDRESS }),
    ]);
    render(<CreatorTab profile={profile({ handle: "ada" })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign challenge & link/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /register on-chain/i })).toBeInTheDocument();
    });
    expect(signWalletMessage).toHaveBeenCalled();
  });

  it("shows the message-incapable wallet guidance when signMessage is unsupported", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    connectWallet.mockResolvedValue(undefined);
    getWalletAddress.mockResolvedValue(STUB_ADDRESS);
    signWalletMessage.mockRejectedValue(new Error("does not support signMessage"));
    classifySignMessageError.mockReturnValue("unsupported");
    mockFetch([() => jsonRes(200, { challenge: "c" })]);
    render(<CreatorTab profile={profile({ handle: "ada" })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign challenge & link/i }));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Reconnect with a message-signing wallet like Freighter/i),
      ).toBeInTheDocument();
    });
  });
});

describe("CreatorTab — gate 3 on-chain register", () => {
  it("submits register_creator and shows registration pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    registerCreatorOnChain.mockResolvedValue({ status: "PENDING", hash: "txhash" });
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    const input = screen.getByPlaceholderText("G…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "GBPAYOUT" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register on-chain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Registration submitted/i)).toBeInTheDocument();
    });
    expect(registerCreatorOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "ada", ownerAddress: STUB_ADDRESS, payoutAddress: "GBPAYOUT" }),
    );
  });

  it("renders the stranded-funds warning when payoutAddressWarning returns 'contract'", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    payoutAddressWarning.mockReturnValue("contract");
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("G…"), { target: { value: "C-TEST" } });
    });
    await waitFor(() => {
      expect(screen.getByText(/contract address/i)).toBeInTheDocument();
    });
  });
});

describe("CreatorTab — Realtime flip to active", () => {
  it("flips to active when the profile row's onchain_registered becomes true", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    registerCreatorOnChain.mockResolvedValue({ status: "PENDING", hash: "txhash" });
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    // Submit so we are in the pending state, then drive the Realtime callback.
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("G…"), { target: { value: "GBPAYOUT" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register on-chain/i }));
    });
    await waitFor(() => {
      expect(realtimeCb).not.toBeNull();
    });
    await act(async () => {
      realtimeCb?.({
        new: { onchain_registered: true, payout_address: "GBPAYOUT" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Creator is active/i)).toBeInTheDocument();
    });
  });
});
