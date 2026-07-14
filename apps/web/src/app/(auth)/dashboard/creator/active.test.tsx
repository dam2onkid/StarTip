// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CreatorProfile, CreatorActiveData, CreatorDonationRow } from "@/app/(auth)/dashboard/creator/types";
import { ActiveGate } from "@/app/(auth)/dashboard/creator/active";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const updateCreatorPayoutOnChain = vi.hoisted(() => vi.fn());
const setCreatorActiveOnChain = vi.hoisted(() => vi.fn());
const updateDonationModerationStatus = vi.hoisted(() => vi.fn());
const readTreasuryAddress = vi.hoisted(() => vi.fn(async () => null));
const payoutAddressWarning = vi.hoisted(() => vi.fn((): "contract" | "treasury" | null => null));

vi.mock("@/lib/creators/active", () => ({
  updateCreatorPayoutOnChain,
  setCreatorActiveOnChain,
}));

vi.mock("@/lib/creators/moderation", () => ({
  updateDonationModerationStatus,
}));

vi.mock("@/lib/onboarding/register", () => ({
  registerCreatorOnChain: vi.fn(),
  readTreasuryAddress,
  payoutAddressWarning,
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

const removeChannel = vi.fn();
const channelOn = vi.fn(function (this: unknown) {
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
    paused: false,
    ...over,
  };
}

function activeProfile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return profile({
    handle: "ada",
    owner_address: STUB_ADDRESS,
    onchain_registered: true,
    overlay_id: "abc123",
    payout_address: "GBPAYOUT",
    paused: false,
    display_name: "Ada",
    bio: "Pioneer programmer.",
    ...over,
  });
}

const donationRow: CreatorDonationRow = {
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
};

const hiddenRow: CreatorDonationRow = {
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
};

function activeData(over: Partial<CreatorActiveData> = {}): CreatorActiveData {
  return {
    stats: { total: "900", count: 3 },
    leaderboard: [
      { donor_name: "Bob", total_amount: "500" },
      { donor_name: "Ada", total_amount: "400" },
    ],
    recent: [donationRow, hiddenRow],
    ...over,
  };
}

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const method = init?.method ?? "GET";
    if (u.includes("/api/tts/voices") && method === "GET") {
      return jsonRes(200, { voices: [] });
    }
    if (u.includes("/goal") && method === "GET") {
      return jsonRes(200, null);
    }
    if (u.includes("/api/overlay-settings") && method === "GET") {
      const next = calls.shift();
      if (next) return next(u, init);
      return jsonRes(200, {
        alert_duration_ms: 10000,
        min_amount: "0",
        sound_enabled: true,
        tts_enabled: false,
        tts_voice: null,
      });
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
  updateCreatorPayoutOnChain.mockReset();
  setCreatorActiveOnChain.mockReset();
  updateDonationModerationStatus.mockReset();
  readTreasuryAddress.mockReset().mockResolvedValue(null);
  payoutAddressWarning.mockReset().mockReturnValue(null);
  removeChannel.mockReset();
  vi.mocked(toast, true).success.mockClear();
  vi.mocked(toast, true).info.mockClear();
  vi.mocked(toast, true).error.mockClear();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const method = init?.method ?? "GET";
    if (u.includes("/api/tts/voices") && method === "GET") {
      return jsonRes(200, { voices: [] });
    }
    if (u.includes("/api/overlay-settings") && method === "GET") {
      return jsonRes(200, {
        alert_duration_ms: 10000,
        min_amount: "0",
        sound_enabled: true,
        tts_enabled: false,
        tts_voice: null,
      });
    }
    if (u.includes("/goal") && method === "GET") {
      return jsonRes(200, null);
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ActiveGateWrapper({
  initial,
  data,
}: {
  initial: CreatorProfile;
  data?: CreatorActiveData;
}) {
  const [current, setCurrent] = useState(initial);
  return (
    <TooltipProvider>
      <ActiveGate
        current={current}
        activeData={data}
        onUpdate={setCurrent}
        tokens={[]}
      />
    </TooltipProvider>
  );
}

async function openCreatorTab(name: RegExp) {
  const tablist = screen.getByRole("tablist", { name: /creator tabs/i });
  await act(async () => {
    fireEvent.click(within(tablist).getByRole("tab", { name }));
  });
}

describe("ActiveGate - overview", () => {
  it("renders stats (total + count) from activeData", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    expect(screen.getByTestId("creator-total-received")).toHaveTextContent("900");
    expect(screen.getByTestId("creator-donation-count")).toHaveTextContent("3");
  });

  it("hides the onboarding stepper and shows the creator tabs", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    expect(screen.queryByTestId("gate-stepper")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /creator tabs/i })).toBeInTheDocument();
  });

  it("renders the per-creator leaderboard from activeData", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    const board = screen.getByTestId("creator-leaderboard");
    expect(board.textContent).toContain("Bob");
    expect(board.textContent).toContain("500");
  });

  it("renders on-chain status (owner, payout, paused/active)", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    expect(screen.getByTestId("onchain-owner")).toHaveTextContent(STUB_ADDRESS);
    expect(screen.getByTestId("onchain-payout")).toHaveTextContent("GBPAYOUT");
    expect(screen.getByTestId("onchain-paused")).toHaveTextContent(/active/i);
  });
});

describe("ActiveGate - profile & links", () => {
  it("renders the overlay URL with the overlay_id", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/overlay/i);
    expect(screen.getByTestId("overlay-url")).toHaveTextContent(/\/overlay\/abc123/);
    expect(screen.getByTestId("overlay-copy")).toBeInTheDocument();
  });

  it("renders a QR card encoding the creator's donate URL with a Download PNG button", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/profile & links/i);
    const qr = await screen.findByTestId("qr-svg");
    expect(qr.getAttribute("data-qr-value")).toMatch(/\/creator\/ada\/donate/);
    expect(screen.getByTestId("donate-url")).toHaveTextContent(/\/creator\/ada\/donate/);
    expect(screen.getByTestId("qr-download-png")).toBeInTheDocument();
  });
});

describe("ActiveGate - payout", () => {
  it("submits update_creator_payout and shows pending", async () => {
    updateCreatorPayoutOnChain.mockResolvedValue({ status: "PENDING", hash: "tx2" });
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/payout/i);
    await act(async () => {
      fireEvent.change(screen.getByTestId("payout-update-input"), { target: { value: "GBNEW" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("payout-update-submit"));
    });
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Payout update submitted. Your new address will appear shortly.",
      );
    });
    expect(updateCreatorPayoutOnChain).toHaveBeenCalledWith({
      ownerAddress: STUB_ADDRESS,
      handle: "ada",
      newPayoutAddress: "GBNEW",
    });
  });

  it("payout update warns when the address equals the contract address", async () => {
    payoutAddressWarning.mockReturnValue("contract");
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/payout/i);
    await act(async () => {
      fireEvent.change(screen.getByTestId("payout-update-input"), { target: { value: "C-TEST" } });
    });
    await waitFor(() => {
      expect(screen.getByText(/contract address/i)).toBeInTheDocument();
    });
  });

  it("pause toggle signs + submits set_creator_active_owner and shows pending", async () => {
    setCreatorActiveOnChain.mockResolvedValue({ status: "PENDING", hash: "tx3" });
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/payout/i);
    expect(screen.getByTestId("pause-toggle")).toHaveTextContent("Pause");
    await act(async () => {
      fireEvent.click(screen.getByTestId("pause-toggle"));
    });
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Pause submitted. Donations will stop shortly.",
      );
    });
    expect(setCreatorActiveOnChain).toHaveBeenCalledWith({
      ownerAddress: STUB_ADDRESS,
      handle: "ada",
      active: false,
    });
  });
});

describe("ActiveGate - overlay settings", () => {
  it("renders the Overlay Settings card with fields loaded from the API", async () => {
    mockFetch([
      () => jsonRes(200, { alert_duration_ms: 4000, min_amount: "5", sound_enabled: false }),
    ]);
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/overlay/i);
    const card = await screen.findByTestId("overlay-settings-card");
    expect(card).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("overlay-duration-input")).toHaveValue(4000);
    });
    expect(screen.getByTestId("overlay-min-amount-input")).toHaveValue(5);
    expect(screen.getByTestId("overlay-sound-toggle")).not.toBeChecked();
  });

  it("PUTs the edited overlay settings and shows a saved status", async () => {
    const puts: { url: string; method: string; body: unknown }[] = [];
    mockFetch([
      () => jsonRes(200, { alert_duration_ms: 6000, min_amount: "0", sound_enabled: true }),
      (url, init) => {
        puts.push({ url, method: init?.method ?? "GET", body: JSON.parse(init?.body as string) });
        return jsonRes(200, { alert_duration_ms: 3000, min_amount: 2, sound_enabled: false });
      },
    ]);
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/overlay/i);
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
      expect(toast.success).toHaveBeenCalledWith("Overlay settings saved.");
    });
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.url).toContain("/api/overlay-settings");
    expect(put?.body).toEqual({
      alert_duration_ms: 3000,
      min_amount: 2,
      sound_enabled: false,
      tts_enabled: false,
      tts_voice: null,
    });
  });

  it("PUTs Alert Reading enabled with a selected Voice", async () => {
    const puts: { body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/tts/voices") && method === "GET") {
        return jsonRes(200, {
          voices: [
            { id: "en-US-EmmaNeural", name: "Emma", locale: "en-US", gender: "Female" },
          ],
        });
      }
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, {
          alert_duration_ms: 6000,
          min_amount: "0",
          sound_enabled: true,
          tts_enabled: false,
          tts_voice: null,
        });
      }
      if (u.includes("/api/overlay-settings") && method === "PUT") {
        puts.push({ body: JSON.parse(init?.body as string) });
        return jsonRes(200, {
          alert_duration_ms: 6000,
          min_amount: "0",
          sound_enabled: true,
          tts_enabled: true,
          tts_voice: "en-US-EmmaNeural",
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/overlay/i);

    const ttsToggle = await screen.findByTestId("overlay-tts-toggle");
    await act(async () => {
      fireEvent.click(ttsToggle);
    });

    const voiceSelect = await screen.findByTestId("overlay-voice-select");
    await act(async () => {
      fireEvent.change(voiceSelect, { target: { value: "en-US-EmmaNeural" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("overlay-settings-save"));
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Overlay settings saved.");
    });

    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      alert_duration_ms: 6000,
      min_amount: 0,
      sound_enabled: true,
      tts_enabled: true,
      tts_voice: "en-US-EmmaNeural",
    });
  });
});

describe("ActiveGate - donation goal", () => {
  it("renders the Donation Goal card empty state when no goal is set", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData({ goal: null })} />);
    await openCreatorTab(/overlay/i);
    const card = await screen.findByTestId("donation-goal-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("donation-goal-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("donation-goal-progress")).not.toBeInTheDocument();
  });

  it("renders the Donation Goal card progress from activeData", async () => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/tts/voices") && method === "GET") {
        return jsonRes(200, { voices: [] });
      }
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, {
          alert_duration_ms: 6000,
          min_amount: "0",
          sound_enabled: true,
          tts_enabled: false,
          tts_voice: null,
        });
      }
      if (u.includes("/goal") && method === "GET") {
        return jsonRes(200, { target_amount: "1000000000", token: "CDUMMY-USDC-CONTRACT" });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    render(
      <ActiveGateWrapper
        initial={activeProfile()}
        data={activeData({
          goal: {
            current: "350000000",
            target: "1000000000",
            pct: 35,
            token: "CDUMMY-USDC-CONTRACT",
          },
        })}
      />,
    );
    await openCreatorTab(/overlay/i);
    await screen.findByTestId("donation-goal-card");
    await waitFor(() => {
      expect(screen.getByTestId("donation-goal-pct")).toHaveTextContent("35%");
    });
    expect(screen.getByTestId("donation-goal-current")).toHaveTextContent("350");
    expect(screen.getByTestId("donation-goal-target")).toHaveTextContent(/1000/);
    const progressBar = screen.getByTestId("donation-goal-bar");
    expect(progressBar).toHaveClass("w-full");
    expect(progressBar).toHaveStyle({ transform: "scaleX(0.35)" });
  });

  it("PUTs the edited donation goal and shows a saved status", async () => {
    const puts: { url: string; method: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/tts/voices") && method === "GET") {
        return jsonRes(200, { voices: [] });
      }
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, {
          alert_duration_ms: 6000,
          min_amount: "0",
          sound_enabled: true,
          tts_enabled: false,
          tts_voice: null,
        });
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
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData({ goal: null })} />);
    await openCreatorTab(/overlay/i);
    const targetInput = await screen.findByTestId("donation-goal-target-input");
    await act(async () => {
      fireEvent.change(targetInput, { target: { value: "5000" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("donation-goal-save"));
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Donation goal saved.");
    });
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.url).toContain("/api/creators/ada/goal");
    expect(put?.body).toEqual({
      target_amount: "5000000000",
      token: "CDUMMY-USDC-CONTRACT",
    });
  });

  it("clears the donation goal via the Clear button (PUT target_amount = 0)", async () => {
    const puts: { url: string; method: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      if (u.includes("/api/tts/voices") && method === "GET") {
        return jsonRes(200, { voices: [] });
      }
      if (u.includes("/api/overlay-settings") && method === "GET") {
        return jsonRes(200, {
          alert_duration_ms: 6000,
          min_amount: "0",
          sound_enabled: true,
          tts_enabled: false,
          tts_voice: null,
        });
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
      <ActiveGateWrapper
        initial={activeProfile()}
        data={activeData({
          goal: {
            current: "100000000",
            target: "1000000000",
            pct: 10,
            token: "CDUMMY-USDC-CONTRACT",
          },
        })}
      />,
    );
    await openCreatorTab(/overlay/i);
    await screen.findByTestId("donation-goal-progress");
    await act(async () => {
      fireEvent.click(screen.getByTestId("donation-goal-clear"));
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Donation goal cleared.");
    });
    const put = puts.find((p) => p.method === "PUT");
    expect(put).toBeDefined();
    expect(put?.body).toMatchObject({ target_amount: 0 });
  });
});

describe("ActiveGate - moderation", () => {
  it("lists donations including hidden in the moderation list", async () => {
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/moderation/i);
    const list = screen.getByTestId("moderation-list");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("Troll");
  });

  it("toggles a donation's visibility via the moderation RLS path", async () => {
    updateDonationModerationStatus.mockResolvedValue({ ok: true });
    render(<ActiveGateWrapper initial={activeProfile()} data={activeData()} />);
    await openCreatorTab(/moderation/i);
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
});
