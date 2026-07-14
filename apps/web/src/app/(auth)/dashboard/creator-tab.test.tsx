// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { CreatorProfile } from "@/app/(auth)/dashboard/creator-tab";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.fn();
const getWalletAddress = vi.fn();
const signWalletMessage = vi.fn();
const disconnectWallet = vi.fn();
const registerCreatorOnChain = vi.fn();
const readTreasuryAddress = vi.fn(async () => null);
const payoutAddressWarning = vi.fn((): "contract" | "treasury" | null => null);

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  getWalletAddress,
  signWalletMessage,
  disconnectWallet,
  classifySignMessageError: vi.fn((): "unsupported" | "unknown" => "unknown"),
}));

vi.mock("@/lib/onboarding/register", () => ({
  registerCreatorOnChain,
  readTreasuryAddress,
  payoutAddressWarning,
}));

vi.mock("@/lib/creators/active", () => ({
  updateCreatorPayoutOnChain: vi.fn(),
  setCreatorActiveOnChain: vi.fn(),
}));

vi.mock("@/lib/creators/moderation", () => ({
  updateDonationModerationStatus: vi.fn(),
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
}));

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
  QRCodeSVG.displayName = "MockQRCodeSVG";
  return { QRCodeSVG };
});

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
    from: vi.fn((table: string) => {
      const state = { payload: null as unknown, filters: {} as Record<string, unknown> };
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
          return Promise.resolve({ data: null, error: null }).then(
            onFulfilled as ((v: unknown) => unknown) | null,
          );
        },
      };
      return self;
    }),
    storage: {
      from(bucket: string) {
        return {
          upload(path: string) {
            return Promise.resolve({ data: { path }, error: null });
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://stub/storage/v1/object/public/${bucket}/${path}` } };
          },
        };
      },
    },
  })),
}));

function profile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: "p1",
    user_id: "u1",
    display_name: "Anonymous",
    avatar_url: null,
    banner_url: null,
    bio: null,
    handle: null,
    owner_address: null,
    onchain_registered: false,
    overlay_id: null,
    paused: false,
    ...over,
  };
}

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const method = init?.method ?? "GET";
    if (u.includes("/api/overlay-settings") && method === "GET" && calls.length === 0) {
      return jsonRes(200, {
        alert_duration_ms: 10000,
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
  removeChannel.mockReset();
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = url.toString();
    if (u.includes("/api/overlay-settings")) {
      return jsonRes(200, {
        alert_duration_ms: 10000,
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

describe("CreatorTab - gate rendering", () => {
  it("renders the Become a Creator affordance at profile_pending", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    render(<CreatorTab profile={profile()} />);
    expect(screen.getByRole("button", { name: /become a creator/i })).toBeInTheDocument();
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
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    expect(screen.getByRole("button", { name: /register creator/i })).toBeInTheDocument();
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
          payout_address: "GBPAYOUT",
          display_name: "Ada",
        })}
      />,
    );
    expect(screen.getByTestId("creator-active")).toBeInTheDocument();
    expect(screen.getByText(/Creator Status/i)).toBeInTheDocument();
  });

  it("returns to the wallet link gate when change wallet is clicked", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    disconnectWallet.mockResolvedValue(undefined);
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /change wallet/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Link your Stellar wallet/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    });
  });
});

describe("CreatorTab - Realtime flip to active", () => {
  it("flips to active when the profile row's onchain_registered becomes true", async () => {
    const { CreatorTab } = await import("@/app/(auth)/dashboard/creator-tab");
    registerCreatorOnChain.mockResolvedValue({ status: "PENDING", hash: "txhash" });
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    render(
      <CreatorTab profile={profile({ handle: "ada", owner_address: STUB_ADDRESS })} />,
    );
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("G…"), { target: { value: "GBPAYOUT" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register creator/i }));
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
