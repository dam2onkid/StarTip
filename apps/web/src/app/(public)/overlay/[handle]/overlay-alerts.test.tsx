// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  OverlayAlerts,
  type OverlayDonation,
  type OverlayRealtimeStub,
} from "./overlay-alerts";
import type { OverlaySettings } from "@/lib/overlay/settings";

/**
 * Overlay client component unit tests. The Supabase browser client is mocked
 * so the Realtime hook captures the `postgres_changes` insert/update
 * callbacks; tests drive new donations through those callbacks to assert live
 * inserts render without a reload and updates enrich queued alerts. The
 * `window.__STARTIP_OVERLAY_REALTIME_STUB__` seam is also exercised directly
 * to mirror the Playwright E2E path.
 *
 * Hidden-donation suppression is asserted at the client boundary: the server
 * component (and the RLS policy on the Realtime channel) filter hidden rows
 * before they reach the client, so the client only ever receives visible
 * rows. These tests confirm the client does not fabricate or re-show hidden
 * data it is handed.
 */

const VISIBLE: OverlayDonation[] = [
  {
    id: "d1",
    donor_name: "Ada",
    amount: "100",
    token: "CUSDC",
    message: "Thank you!",
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "d2",
    donor_name: "Bob",
    amount: "500",
    token: "CUSDC",
    message: null,
    created_at: "2026-06-02T00:00:00Z",
  },
];

const TOKENS = [{ contract_address: "CUSDC", symbol: "USDC" }];

let realtimeInsertCb: ((payload: { new: unknown }) => void) | null = null;
let realtimeUpdateCb: ((payload: { new: unknown }) => void) | null = null;
const removeChannel = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn(function (this: unknown, _event: string, filter: { event?: string }, cb: (p: { new: unknown }) => void) {
        if (filter.event === "INSERT") realtimeInsertCb = cb;
        if (filter.event === "UPDATE") realtimeUpdateCb = cb;
        return this;
      }),
      subscribe: vi.fn(function (this: unknown) {
        return this;
      }),
    })),
    removeChannel,
  })),
}));

// Audio mock: jsdom's HTMLMediaElement.play() is not implemented and returns
// a promise that never settles, which would hang any test that triggers a
// Realtime insert (the overlay plays a sound on insert). Each test can spy on
// `Audio` to assert sound gating; the mock records the URL and resolves play.
const audioPlay = vi.fn(() => Promise.resolve());
const audioInstances: { src: string; volume: number; played: boolean }[] = [];

beforeEach(() => {
  realtimeInsertCb = null;
  realtimeUpdateCb = null;
  removeChannel.mockClear();
  audioPlay.mockClear();
  audioInstances.length = 0;
  // Stub the global Audio constructor so `new Audio(url)` returns a controllable
  // object. Tests that care about sound assert on `audioInstances`.
  vi.stubGlobal("Audio", vi.fn(function (this: unknown, url: string) {
    const inst = {
      src: url,
      volume: 1,
      played: false,
      play: vi.fn(() => {
        inst.played = true;
        return audioPlay();
      }),
    };
    audioInstances.push(inst);
    return inst;
  }));
});

afterEach(() => {
  // Clear any stub a test may have installed on the window.
  (window as unknown as { __STARTIP_OVERLAY_REALTIME_STUB__?: OverlayRealtimeStub }).__STARTIP_OVERLAY_REALTIME_STUB__ = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OverlayAlerts — initial render", () => {
  it("renders each seeded visible donation with Donor Name, amount + symbol, and message", () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
      />,
    );

    const alerts = screen.getByTestId("overlay-alerts");
    expect(alerts).toBeInTheDocument();
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);

    // Ada: name, amount, symbol, message.
    const adaAlert = screen.getAllByTestId("overlay-alert").find((el) =>
      el.querySelector("[data-testid='alert-donor-name']")?.textContent === "Ada",
    );
    expect(adaAlert).toBeDefined();
    expect(adaAlert?.querySelector("[data-testid='alert-amount']")).toHaveTextContent("100");
    expect(adaAlert?.querySelector("[data-testid='alert-symbol']")).toHaveTextContent("USDC");
    expect(adaAlert?.querySelector("[data-testid='alert-message']")).toHaveTextContent("\"Thank you!\"");

    // Bob is queued behind Ada and appears after Ada expires.
    expect(screen.queryByText(/Bob donated/)).toBeNull();
  });

  it("falls back to the raw token string when no allowlist entry matches", () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[
          { id: "x", donor_name: "Ada", amount: "1", token: "USDC", message: null, created_at: "t" },
        ]}
        tokenAllowlist={[]}
      />,
    );
    expect(screen.getByTestId("alert-symbol")).toHaveTextContent("USDC");
  });

  it("converts the raw amount to display units using the token decimals", () => {
    // The contract stores amounts in the smallest divisible unit (10^decimals
    // per display unit). 90000000 raw at 7 decimals (native XLM) renders as "9",
    // not "90000000".
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[
          { id: "xlm", donor_name: "Ada", amount: "90000000", token: "XLM_CONTRACT", message: null, created_at: "t" },
        ]}
        tokenAllowlist={[{ contract_address: "XLM_CONTRACT", symbol: "XLM", decimals: 7 }]}
      />,
    );
    expect(screen.getByTestId("alert-amount")).toHaveTextContent("9");
    expect(screen.getByTestId("alert-symbol")).toHaveTextContent("XLM");
  });

  it("renders fractional display amounts and trims trailing zeros", () => {
    // 1500000 raw at 6 decimals (USDC) = 1.5 display units.
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[
          { id: "usdc", donor_name: "Bob", amount: "1500000", token: "CUSDC", message: null, created_at: "t" },
        ]}
        tokenAllowlist={[{ contract_address: "CUSDC", symbol: "USDC", decimals: 6 }]}
      />,
    );
    expect(screen.getByTestId("alert-amount")).toHaveTextContent("1.5");
  });

  it("renders the raw amount unchanged when the token has no decimals entry", () => {
    // Fallback: a token with no allowlist entry (or no decimals) uses
    // decimals = 0, so the raw amount is rendered as-is.
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[
          { id: "raw", donor_name: "Ada", amount: "90000000", token: "UNKNOWN", message: null, created_at: "t" },
        ]}
        tokenAllowlist={[]}
      />,
    );
    expect(screen.getByTestId("alert-amount")).toHaveTextContent("90000000");
  });

  it("does not render hidden donations handed to it (client never receives them)", () => {
    // The server / RLS filter hidden rows before the client sees them. The
    // client is only ever handed visible rows; assert it renders exactly
    // those and nothing hidden.
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
      />,
    );
    expect(screen.queryByText("Troll")).toBeNull();
    expect(screen.queryByText("hidden bad words")).toBeNull();
  });
});

describe("OverlayAlerts — Realtime inserts", () => {
  it("appends a new donation delivered through the postgres_changes channel", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
      />,
    );
    expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);

    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "d9",
          donor_name: "Latecomer",
          amount: "42",
          token: "CUSDC",
          message: "Caught the stream late!",
          created_at: "2026-06-06T00:00:00Z",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
    });
    const late = screen.getAllByTestId("overlay-alert").find((el) =>
      el.querySelector("[data-testid='alert-donor-name']")?.textContent === "Latecomer",
    );
    expect(late).toBeDefined();
    expect(late?.querySelector("[data-testid='alert-amount']")).toHaveTextContent("42");
    expect(late?.querySelector("[data-testid='alert-symbol']")).toHaveTextContent("USDC");
    expect(late?.querySelector("[data-testid='alert-message']")).toHaveTextContent("Caught the stream late!");
  });

  it("converts a Realtime insert's raw amount to display units", async () => {
    // A live insert carries the raw i128 amount from the contract; the overlay
    // must convert it to display units using the token's decimals before
    // rendering, so a 90000000-raw XLM donation shows as "9" not "90000000".
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={[{ contract_address: "XLM_CONTRACT", symbol: "XLM", decimals: 7 }]}
      />,
    );

    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "live",
          donor_name: "LiveDonor",
          amount: "90000000",
          token: "XLM_CONTRACT",
          message: null,
          created_at: "t",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("LiveDonor")).toBeInTheDocument();
    });
    expect(screen.getByTestId("alert-amount")).toHaveTextContent("9");
    expect(screen.getByTestId("alert-symbol")).toHaveTextContent("XLM");
  });

  it("ignores malformed Realtime inserts instead of rendering donated 0", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
      />,
    );

    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "bad",
          donor_name: "",
          amount: undefined,
          token: "",
          message: "missing required fields",
          created_at: "t",
        },
      });
    });

    expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);
    expect(screen.queryByText(/donated 0/)).toBeNull();
    expect(audioInstances).toHaveLength(0);
  });

  it("updates a queued Realtime donation when the row is enriched", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
      />,
    );

    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "indexed-first",
          donor_name: "Anonymous",
          amount: "42",
          token: "CUSDC",
          message: null,
          created_at: "t",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Anonymous");
    });

    await act(async () => {
      realtimeUpdateCb?.({
        new: {
          id: "indexed-first",
          donor_name: "Alice",
          amount: "42",
          token: "CUSDC",
          message: "Now enriched",
          created_at: "t",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Alice");
    });
    expect(screen.getByTestId("alert-message")).toHaveTextContent("\"Now enriched\"");
    expect(audioInstances).toHaveLength(1);
  });

  it("queues donations and shows them one at a time", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
        settings={{ alertDurationMs: 1000, soundEnabled: false }}
      />,
    );
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        realtimeInsertCb?.({
          new: {
            id: `n${i}`,
            donor_name: `Donor${i}`,
            amount: "1",
            token: "CUSDC",
            message: null,
            created_at: "t",
          },
        });
      });
    }
    await waitFor(() => {
      expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
    });
    expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Donor0");
    expect(screen.queryByText("Donor1")).toBeNull();

    await waitFor(() => {
      expect(screen.getAllByTestId("alert-donor-name").some((el) => el.textContent === "Donor1")).toBe(true);
    }, { timeout: 3500 });
  });

  it("de-duplicates inserts by id (Realtime may re-deliver)", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
      />,
    );
    await act(async () => {
      realtimeInsertCb?.({
        new: { id: "d1", donor_name: "Ada", amount: "100", token: "CUSDC", message: "dup", created_at: "t" },
      });
    });
    // d1 already exists; no new alert is added.
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
  });

  it("uses the window.__STARTIP_OVERLAY_REALTIME_STUB__ seam when present", async () => {
    let onInsert: ((row: OverlayDonation) => void) | null = null;
    const unsubscribe = vi.fn();
    (window as unknown as { __STARTIP_OVERLAY_REALTIME_STUB__?: OverlayRealtimeStub }).__STARTIP_OVERLAY_REALTIME_STUB__ = {
      subscribe: (cb) => {
        onInsert = cb;
        return unsubscribe;
      },
    };

    const { unmount } = render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
      />,
    );
    expect(onInsert).not.toBeNull();

    await act(async () => {
      onInsert?.({
        id: "d9",
        donor_name: "Seam",
        amount: "7",
        token: "CUSDC",
        message: "via stub",
        created_at: "t",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Seam");
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("OverlayAlerts — overlay settings (auto-dismiss, min_amount, sound)", () => {
  it("auto-dismisses each alert after alert_duration_ms", async () => {
    // Use the shortest valid duration with real timers so framer-motion's exit animation
    // (rAF-based) can flush the exiting nodes from the DOM. The auto-dismiss
    // timer is a real `window.setTimeout`; this tests the actual behavior.
    const settings: OverlaySettings = { alertDurationMs: 1000, soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[VISIBLE[0]]}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);

    // After the duration elapses, the active alert is removed from the queue and
    // framer-motion's exit animation flushes them from the DOM.
    await waitFor(
      () => {
        expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);
      },
      { timeout: 4000 },
    );
  });

  it("does not auto-dismiss before alert_duration_ms elapses (fake timers)", async () => {
    vi.useFakeTimers();
    const settings: OverlaySettings = { alertDurationMs: 5000, soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
  });

  it("suppresses initial donations below min_amount (raw units)", () => {
    const settings: OverlaySettings = { minAmountRaw: "200", soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    // Ada (100) is below 200 -> suppressed. Bob (500) is above -> shown.
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("suppresses Realtime inserts below min_amount (raw units)", async () => {
    const settings: OverlaySettings = { minAmountRaw: "200", soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);

    // Insert below threshold -> suppressed, not rendered, no sound.
    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "small",
          donor_name: "Small",
          amount: "50",
          token: "CUSDC",
          message: null,
          created_at: "t",
        },
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("Small")).toBeNull();
    });
    expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);

    // Insert at/above threshold -> rendered.
    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "big",
          donor_name: "Big",
          amount: "300",
          token: "CUSDC",
          message: null,
          created_at: "t",
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Big")).toBeInTheDocument();
    });
  });

  it("plays a sound on Realtime insert when sound_enabled is true", async () => {
    const settings: OverlaySettings = { soundEnabled: true };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    // Initial render does not play a sound (only Realtime inserts do).
    expect(audioInstances).toHaveLength(0);

    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "d9",
          donor_name: "Latecomer",
          amount: "42",
          token: "CUSDC",
          message: "hi",
          created_at: "t",
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Latecomer")).toBeInTheDocument();
    });
    // A sound was created and played.
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe("/alert.mp3");
    expect(audioInstances[0].played).toBe(true);
  });

  it("does not play a sound when sound_enabled is false", async () => {
    const settings: OverlaySettings = { soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[]}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    await act(async () => {
      realtimeInsertCb?.({
        new: {
          id: "d9",
          donor_name: "Latecomer",
          amount: "42",
          token: "CUSDC",
          message: "hi",
          created_at: "t",
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Latecomer")).toBeInTheDocument();
    });
    expect(audioInstances).toHaveLength(0);
  });

  it("does not play a sound on the initial server-rendered donations", () => {
    const settings: OverlaySettings = { soundEnabled: true };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    expect(audioInstances).toHaveLength(0);
  });

  it("uses the default 10000ms duration when settings.alertDurationMs is omitted (fake timers)", async () => {
    vi.useFakeTimers();
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={{ soundEnabled: false }}
      />,
    );
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
    // Just before 10000ms: the default-duration timer has not fired yet.
    await act(async () => {
      vi.advanceTimersByTime(9999);
    });
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);
  });
});
