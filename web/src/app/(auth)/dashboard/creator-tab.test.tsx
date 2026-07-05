// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { CreatorProfile, CreatorActiveData } from "@/app/(auth)/dashboard/creator-tab";

/**
 * Creator tab four-gate state machine + active-features panel. The wallet kit,
 * fetch, on-chain register/update helpers, and moderation helper are mocked so
 * each gate and active feature can be exercised in isolation. The Realtime
 * flip is driven through a captured subscription callback.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.fn();
const getWalletAddress = vi.fn();
const signWalletMessage = vi.fn();
const classifySignMessageError = vi.fn((): "unsupported" | "unknown" => "unknown");
const registerCreatorOnChain = vi.fn();
const readTreasuryAddress = vi.fn(async () => null);
const payoutAddressWarning = vi.fn((): "contract" | "treasury" | null => null);
const updateCreatorPayoutOnChain = vi.fn();
const setCreatorActiveOnChain = vi.fn();
const updateDonationModerationStatus = vi.fn();

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

vi.mock("@/lib/creators/active", () => ({
  updateCreatorPayoutOnChain,
  setCreatorActiveOnChain,
}));

vi.mock("@/lib/creators/moderation", () => ({
  updateDonationModerationStatus,
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
}));

// Mock the QR library so the test can assert the QR encodes the donate URL
// without rendering a real QR matrix in jsdom. The mock exposes the encoded
// `value` via a data attribute on the <svg>, mirroring how the real
// `QRCodeSVG` forwards a ref to its <svg> element.
vi.mock("qrcode.react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const QRCodeSVG = React.forwardRef<
    SVGSVGElement,
    { value: string } & Record<string, unknown>
  >((props, ref) =>
    React.createElement("svg", {
      ref,
      "data-testid": "qr-svg",
      "data-qr-value": props.value,
    }),
  );
  return { QRCodeSVG };
});

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

// Profile edit + moderation use the browser supabase client's `.from()` and
// `.storage()`. These recorders let the active-feature tests assert on the
// PATCH shape and avatar upload path.
const supabaseUpdateResult = { data: null, error: null as unknown };
const supabaseUploadResult = { data: { path: "u1/t.png" }, error: null as unknown };
const supabaseFromCalls: { table: string; payload: unknown; filters: Record<string, unknown> }[] = [];
const supabaseStorageCalls: { bucket: string; op: string; path: string }[] = [];

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: channelOn,
      subscribe,
    })),
    removeChannel,
    from: vi.fn((table: string) => {
      const state = { payload: null as unknown, filters: {} as Record<string, unknown> };
      // The DonationGoalCard reads the public `tokens` allowlist via a select
      // chain. Return a single USDC test token so the picker renders and the
      // display/raw conversion has a decimals value.
      if (table === "tokens") {
        const tokensChain = {
          select: vi.fn(() => tokensChain),
          then: (onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) =>
            Promise.resolve({
              data: [
                {
                  contract_address: "CDUMMY-USDC-CONTRACT",
                  symbol: "USDC",
                  name: "USD Coin",
                  issuer: null,
                  decimals: 6,
                  icon_url: null,
                },
              ],
              error: null,
            }).then(onFulfilled as ((v: unknown) => unknown) | null),
        };
        return tokensChain;
      }
      const self = {
        update(payload: unknown) { state.payload = payload; return self; },
        eq(col: string, value: unknown) { state.filters[col] = value; return self; },
        then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) {
          supabaseFromCalls.push({ table, payload: state.payload, filters: { ...state.filters } });
          return Promise.resolve(supabaseUpdateResult).then(
            onFulfilled as ((v: unknown) => unknown) | null,
          );
        },
      };
      return self;
    }),
    storage: vi.fn(() => ({
      from(bucket: string) {
        return {
          upload(path: string) {
            supabaseStorageCalls.push({ bucket, op: "upload", path });
            return Promise.resolve(supabaseUploadResult);
          },
          getPublicUrl(path: string) {
            supabaseStorageCalls.push({ bucket, op: "getPublicUrl", path });
            return { data: { publicUrl: `https://stub/storage/v1/object/public/${bucket}/${path}` } };
          },
        };
      },
    })),
  })),
}));

function profile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: "p1",
    user_id: "u1",
    display_name: "Anonymous",
    avatar_url: null,
    bio: null,
    handle: null,
    owner_address: null,
    onchain_registered: false,
    paused: false,
    ...over,
  };
}

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const method = init?.method ?? "GET";
    // The active panel mounts OverlaySettingsCard and DonationGoalCard which
    // GET /api/overlay-settings and /api/creators/[handle]/goal on mount.
    // The DonationGoalCard mount GET always serves the default (null = no
    // goal) so it never consumes a queued action response. The
    // OverlaySettingsCard mount GET consumes the queue if present (so a test
    // can stage a custom settings row) and falls back to defaults otherwise.
    if (u.includes("/api/overlay-settings") && method === "GET" && calls.length === 0) {
      return jsonRes(200, {
        alert_duration_ms: 6000,
        min_amount: "0",
        sound_enabled: true,
      });
    }
    if (u.includes("/goal") && method === "GET") {
      return jsonRes(200, null);
    }
    const next = calls.shift();
    if (!next) throw new Error(`unexpected fetch ${u}`);
    return next(u, init);
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
  updateCreatorPayoutOnChain.mockReset();
  setCreatorActiveOnChain.mockReset();
  updateDonationModerationStatus.mockReset();
  removeChannel.mockReset();
  supabaseFromCalls.length = 0;
  supabaseStorageCalls.length = 0;
  supabaseUpdateResult.error = null;
  supabaseUploadResult.error = null;
  // Default fetch mock: the active-features panel mounts OverlaySettingsCard
  // and DonationGoalCard which GET /api/overlay-settings and
  // /api/creators/[handle]/goal on mount. Return defaults so the cards settle
  // without spurious act() warnings. Tests that need a different fetch queue
  // call mockFetch() to override this.
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = url.toString();
    if (u.includes("/api/overlay-settings")) {
      return jsonRes(200, {
        alert_duration_ms: 6000,
        min_amount: "0",
        sound_enabled: true,
      });
    }
    if (u.includes("/goal")) {
      return jsonRes(200, null);
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
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
    // The gate fires a reconcile fetch on mount; answer it as not-yet-registered.
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
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
    expect(screen.getByTestId("creator-active")).toBeInTheDocument();
    expect(screen.getByText(/On-chain status/i)).toBeInTheDocument();
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
    // challenge, then link, then the onchain_pending gate's mount reconcile
    mockFetch([
      () => jsonRes(200, { challenge: "StarTip wallet link\nHandle: ada\nProfile: x\nNonce: n" }),
      () => jsonRes(200, { owner_address: STUB_ADDRESS }),
      () => jsonRes(200, { onchain_registered: false }),
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
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
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
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
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
    // Mount reconcile must not flip prematurely; Realtime drives the flip.
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
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
      expect(screen.getByTestId("creator-active")).toBeInTheDocument();
    });
  });
});

describe("CreatorTab — active features", () => {
  function activeProfile(over: Partial<CreatorProfile> = {}): CreatorProfile {
    return profile({
      handle: "ada",
      owner_address: STUB_ADDRESS,
      onchain_registered: true,
      payout_address: "GBPAYOUT",
      paused: false,
      display_name: "Ada",
      bio: "Pioneer programmer.",
      ...over,
    });
  }

  function activeData(over: Partial<CreatorActiveData> = {}): CreatorActiveData {
    return {
      stats: { total: "900", count: 3 },
      leaderboard: [
        { donor_name: "Bob", total_amount: "500" },
        { donor_name: "Ada", total_amount: "400" },
      ],
      recent: [
        {
          id: "d1",
          donor_name: "Bob",
          amount: "500",
          token: "USDC",
          message: "Nice!",
          donor_address: "G2",
          user_id: "u2",
          status: "confirmed",
          moderation_status: "visible",
          created_at: "2026-06-02T00:00:00Z",
        },
        {
          id: "d2",
          donor_name: "Troll",
          amount: "1",
          token: "USDC",
          message: "bad",
          donor_address: "G3",
          user_id: "u3",
          status: "confirmed",
          moderation_status: "hidden",
          created_at: "2026-06-03T00:00:00Z",
        },
      ],
      ...over,
    };
  }

  it("renders stats (total + count) from activeData", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    expect(screen.getByTestId("creator-total-received")).toHaveTextContent("900");
    expect(screen.getByTestId("creator-donation-count")).toHaveTextContent("3");
  });

  it("renders the per-creator leaderboard from activeData", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    const board = screen.getByTestId("creator-leaderboard");
    expect(board.textContent).toContain("Bob");
    expect(board.textContent).toContain("500");
  });

  it("renders on-chain status (owner, payout, paused/active)", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    expect(screen.getByTestId("onchain-owner")).toHaveTextContent(STUB_ADDRESS);
    expect(screen.getByTestId("onchain-payout")).toHaveTextContent("GBPAYOUT");
    expect(screen.getByTestId("onchain-paused")).toHaveTextContent("active");
  });

  it("renders the overlay URL with the handle", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    expect(screen.getByTestId("overlay-url")).toHaveTextContent(/\/overlay\/ada/);
    expect(screen.getByTestId("overlay-copy")).toBeInTheDocument();
  });

  it("renders a QR card encoding the creator's donate URL with a Download PNG button", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    // The QR image is present and encodes the donate URL for the handle.
    const qr = await screen.findByTestId("qr-svg");
    expect(qr.getAttribute("data-qr-value")).toMatch(/\/creator\/ada\/donate/);
    // The donate URL is surfaced as readable text alongside the QR.
    expect(screen.getByTestId("donate-url")).toHaveTextContent(/\/creator\/ada\/donate/);
    // The Download PNG button is offered so the creator can save a high-res image.
    expect(screen.getByTestId("qr-download-png")).toBeInTheDocument();
  });

  it("submits update_creator_payout and shows pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    updateCreatorPayoutOnChain.mockResolvedValue({ status: "PENDING", hash: "tx2" });
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId("payout-update-input"), { target: { value: "GBNEW" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("payout-update-submit"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Payout update submitted/i)).toBeInTheDocument();
    });
    expect(updateCreatorPayoutOnChain).toHaveBeenCalledWith({
      ownerAddress: STUB_ADDRESS,
      handle: "ada",
      newPayoutAddress: "GBNEW",
    });
  });

  it("payout update warns when the address equals the contract address", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    payoutAddressWarning.mockReturnValue("contract");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId("payout-update-input"), { target: { value: "C-TEST" } });
    });
    await waitFor(() => {
      expect(screen.getByText(/contract address/i)).toBeInTheDocument();
    });
  });

  it("pause toggle signs + submits set_creator_active_owner and shows pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    setCreatorActiveOnChain.mockResolvedValue({ status: "PENDING", hash: "tx3" });
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    // Currently active -> button says "Pause".
    expect(screen.getByTestId("pause-toggle")).toHaveTextContent("Pause");
    await act(async () => {
      fireEvent.click(screen.getByTestId("pause-toggle"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Pause submitted/i)).toBeInTheDocument();
    });
    expect(setCreatorActiveOnChain).toHaveBeenCalledWith({
      ownerAddress: STUB_ADDRESS,
      handle: "ada",
      active: false,
    });
  });

  it("edits display_name + bio via the owner UPDATE RLS path", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    const nameInput = screen.getByLabelText(/display name/i);
    const bioInput = screen.getByLabelText(/bio/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Ada L." } });
    });
    await act(async () => {
      fireEvent.change(bioInput, { target: { value: "Math pioneer." } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("creator-profile-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("creator-save-status")).toHaveTextContent(/saved/i);
    });
    // Assert the PATCH went to profiles with display_name + bio, filtered by user_id.
    const profilePatch = supabaseFromCalls.find((c) => c.table === "profiles");
    expect(profilePatch).toBeDefined();
    expect(profilePatch?.payload).toEqual({
      display_name: "Ada L.",
      bio: "Math pioneer.",
    });
    expect(profilePatch?.filters.user_id).toBe("u1");
  });

  it("renders the avatar input and placeholder when no avatar is set", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile({ avatar_url: null })} activeData={activeData()} />);
    expect(screen.getByTestId("creator-avatar-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("creator-avatar-input")).toBeInTheDocument();
  });

  it("lists donations including hidden in the moderation list", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    const list = screen.getByTestId("moderation-list");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("Troll");
  });

  it("toggles a donation's visibility via the moderation RLS path", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    updateDonationModerationStatus.mockResolvedValue({ ok: true });
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    // d1 is visible -> button says "Hide".
    const toggle = screen.getByTestId("moderation-toggle-d1");
    expect(toggle).toHaveTextContent("Hide");
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => {
      expect(updateDonationModerationStatus).toHaveBeenCalled();
    });
    const call = updateDonationModerationStatus.mock.calls[0];
    expect(call[1]).toBe("d1");
    expect(call[2]).toBe("hidden");
  });

  it("renders the Overlay Settings card with fields loaded from the API", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    mockFetch([
      () => jsonRes(200, {
        alert_duration_ms: 4000,
        min_amount: "5",
        sound_enabled: false,
      }),
    ]);
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    const card = await screen.findByTestId("overlay-settings-card");
    expect(card).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("overlay-duration-input")).toHaveValue(4000);
    });
    expect(screen.getByTestId("overlay-min-amount-input")).toHaveValue(5);
    expect(screen.getByTestId("overlay-sound-toggle")).not.toBeChecked();
  });

  it("renders the Overlay Settings card with default values when the API returns defaults", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    await screen.findByTestId("overlay-settings-card");
    await waitFor(() => {
      expect(screen.getByTestId("overlay-duration-input")).toHaveValue(6000);
    });
    expect(screen.getByTestId("overlay-min-amount-input")).toHaveValue(0);
    expect(screen.getByTestId("overlay-sound-toggle")).toBeChecked();
  });

  it("PUTs the edited overlay settings and shows a saved status", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    const puts: { url: string; method: string; body: unknown }[] = [];
    mockFetch([
      // GET on mount
      () => jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true }),
      // PUT on save
      (url, init) => {
        puts.push({ url, method: init?.method ?? "GET", body: JSON.parse(init?.body as string) });
        return jsonRes(200, { alert_duration_ms: 3000, min_amount: 2, sound_enabled: false });
      },
    ]);
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    const durationInput = await screen.findByTestId("overlay-duration-input");
    await act(async () => {
      fireEvent.change(durationInput, { target: { value: "3000" } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("overlay-min-amount-input"), { target: { value: "2" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("overlay-sound-toggle"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("overlay-settings-save"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Overlay settings saved/i)).toBeInTheDocument();
    });
    // The PUT hit the right URL with the validated payload.
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.url).toContain("/api/overlay-settings");
    expect(put?.body).toEqual({
      alert_duration_ms: 3000,
      min_amount: 2,
      sound_enabled: false,
    });
  });

  it("shows a not_creator error when the PUT returns 400 not_creator", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    mockFetch([
      () => jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true }),
      () => jsonRes(400, { error: "not_creator" }),
    ]);
    render(<CreatorTab profile={activeProfile()} activeData={activeData()} />);
    await screen.findByTestId("overlay-settings-card");
    await act(async () => {
      fireEvent.click(screen.getByTestId("overlay-settings-save"));
    });
    await waitFor(() => {
      expect(screen.getByText(/claim a handle first/i)).toBeInTheDocument();
    });
  });

  it("renders the Donation Goal card empty state when no goal is set", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={activeProfile()} activeData={activeData({ goal: null })} />);
    const card = await screen.findByTestId("donation-goal-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("donation-goal-empty")).toBeInTheDocument();
    // No progress readout when there is no goal.
    expect(screen.queryByTestId("donation-goal-progress")).not.toBeInTheDocument();
  });

  it("renders the Donation Goal card progress (current/target/pct) from activeData", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    // Serve the goal row via the mount GET so the editable form matches the
    // server snapshot. The token allowlist comes from the supabase mock
    // (USDC, 6 decimals); target 1000 display = 1000000000 raw.
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true });
      }
      if (u.includes("/goal") && method === "GET") {
        return jsonRes(200, { target_amount: "1000000000", token: "CDUMMY-USDC-CONTRACT" });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    render(
      <CreatorTab
        profile={activeProfile()}
        activeData={activeData({
          goal: {
            current: "350000000", // 350 display at 6 decimals
            target: "1000000000", // 1000 display
            pct: 35,
            token: "CDUMMY-USDC-CONTRACT",
          },
        })}
      />,
    );
    await screen.findByTestId("donation-goal-card");
    // The progress readout renders with the server snapshot's current (350)
    // and the target (1000), and the live pct (35%).
    await waitFor(() => {
      expect(screen.getByTestId("donation-goal-pct")).toHaveTextContent("35%");
    });
    expect(screen.getByTestId("donation-goal-current")).toHaveTextContent("350");
    expect(screen.getByTestId("donation-goal-target")).toHaveTextContent(/1000/);
    // The bar fill width tracks the pct.
    expect(screen.getByTestId("donation-goal-bar")).toHaveStyle({ width: "35%" });
  });

  it("PUTs the edited donation goal and shows a saved status", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    const puts: { url: string; method: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true });
      }
      if (u.includes("/goal") && method === "GET") {
        return jsonRes(200, null);
      }
      if (u.includes("/goal") && method === "PUT") {
        puts.push({ url: u, method, body: JSON.parse(init?.body as string) });
        return jsonRes(200, { target_amount: 5000000000, token: "CDUMMY-USDC-CONTRACT" });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    render(<CreatorTab profile={activeProfile()} activeData={activeData({ goal: null })} />);
    const targetInput = await screen.findByTestId("donation-goal-target-input");
    await act(async () => {
      fireEvent.change(targetInput, { target: { value: "5000" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("donation-goal-save"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Donation goal saved/i)).toBeInTheDocument();
    });
    // The PUT hit the goal URL with the raw target (5000 display * 10^6).
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.url).toContain("/api/creators/ada/goal");
    expect(put?.body).toEqual({
      target_amount: 5000000000,
      token: "CDUMMY-USDC-CONTRACT",
    });
  });

  it("clears the donation goal via the Clear button (PUT target_amount = 0)", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    const puts: { url: string; method: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true });
      }
      if (u.includes("/goal") && method === "GET") {
        return jsonRes(200, { target_amount: "1000000000", token: "CDUMMY-USDC-CONTRACT" });
      }
      if (u.includes("/goal") && method === "PUT") {
        puts.push({ url: u, method, body: JSON.parse(init?.body as string) });
        return jsonRes(200, { target_amount: 0, token: "CDUMMY-USDC-CONTRACT" });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    render(
      <CreatorTab
        profile={activeProfile()}
        activeData={activeData({
          goal: {
            current: "100000000",
            target: "1000000000",
            pct: 10,
            token: "CDUMMY-USDC-CONTRACT",
          },
        })}
      />,
    );
    await screen.findByTestId("donation-goal-progress");
    await act(async () => {
      fireEvent.click(screen.getByTestId("donation-goal-clear"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Donation goal cleared/i)).toBeInTheDocument();
    });
    // The clear PUT sent target_amount = 0.
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.body).toMatchObject({ target_amount: 0 });
  });
});
