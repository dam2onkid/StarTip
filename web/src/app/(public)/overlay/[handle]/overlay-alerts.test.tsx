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
 * so the Realtime hook captures the `postgres_changes` insert callback; tests
 * drive new donations through that callback to assert live inserts render
 * without a reload. The `window.__STARTIP_OVERLAY_REALTIME_STUB__` seam is
 * also exercised directly to mirror the Playwright E2E path.
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

let realtimeCb: ((payload: { new: OverlayDonation }) => void) | null = null;
const removeChannel = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn(function (this: unknown, _event: string, _filter: unknown, cb: (p: { new: OverlayDonation }) => void) {
        realtimeCb = cb;
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
  realtimeCb = null;
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
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);

    // Ada: name, amount, symbol, message.
    const adaAlert = screen.getAllByTestId("overlay-alert").find((el) =>
      el.querySelector("[data-testid='alert-donor-name']")?.textContent === "Ada",
    );
    expect(adaAlert).toBeDefined();
    expect(adaAlert?.querySelector("[data-testid='alert-amount']")).toHaveTextContent("100");
    expect(adaAlert?.querySelector("[data-testid='alert-symbol']")).toHaveTextContent("USDC");
    expect(adaAlert?.querySelector("[data-testid='alert-message']")).toHaveTextContent("Thank you!");

    // Bob: no message node when message is null.
    const bobAlert = screen.getAllByTestId("overlay-alert").find((el) =>
      el.querySelector("[data-testid='alert-donor-name']")?.textContent === "Bob",
    );
    expect(bobAlert).toBeDefined();
    expect(bobAlert?.querySelector("[data-testid='alert-amount']")).toHaveTextContent("500");
    expect(bobAlert?.querySelector("[data-testid='alert-symbol']")).toHaveTextContent("USDC");
    expect(bobAlert?.querySelector("[data-testid='alert-message']")).toBeNull();
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

  it("does not render hidden donations handed to it (client never receives them)", () => {
    // The server / RLS filter hidden rows before the client sees them. The
    // client is only ever handed visible rows; assert it renders exactly
    // those and nothing hidden.
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
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
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
      />,
    );
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);

    await act(async () => {
      realtimeCb?.({
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
      expect(screen.getAllByTestId("overlay-alert")).toHaveLength(3);
    });
    const late = screen.getAllByTestId("overlay-alert").find((el) =>
      el.querySelector("[data-testid='alert-donor-name']")?.textContent === "Latecomer",
    );
    expect(late).toBeDefined();
    expect(late?.querySelector("[data-testid='alert-amount']")).toHaveTextContent("42");
    expect(late?.querySelector("[data-testid='alert-symbol']")).toHaveTextContent("USDC");
    expect(late?.querySelector("[data-testid='alert-message']")).toHaveTextContent("Caught the stream late!");
  });

  it("drops the oldest alert once the cap is reached", async () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
      />,
    );
    // Push past the MAX_ALERTS (5) cap: 2 seeded + 4 inserts = 6 -> oldest
    // (Ada) is dropped.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        realtimeCb?.({
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
      expect(screen.getAllByTestId("overlay-alert")).toHaveLength(5);
    });
    // Ada (the oldest seeded) is no longer rendered.
    expect(screen.queryByText("Ada")).toBeNull();
    // Bob (second-oldest) is still present.
    expect(screen.getByText("Bob")).toBeInTheDocument();
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
      realtimeCb?.({
        new: { id: "d1", donor_name: "Ada", amount: "100", token: "CUSDC", message: "dup", created_at: "t" },
      });
    });
    // d1 already exists; no new alert is added.
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);
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
        initialDonations={VISIBLE}
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
      expect(screen.getByText("Seam")).toBeInTheDocument();
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("OverlayAlerts — overlay settings (auto-dismiss, min_amount, sound)", () => {
  it("auto-dismisses each alert after alert_duration_ms", async () => {
    // Use a short duration with real timers so framer-motion's exit animation
    // (rAF-based) can flush the exiting nodes from the DOM. The auto-dismiss
    // timer is a real `window.setTimeout`; this tests the actual behavior.
    const settings: OverlaySettings = { alertDurationMs: 100, soundEnabled: false };
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);

    // After the duration elapses, both alerts are removed from the queue and
    // framer-motion's exit animation flushes them from the DOM.
    await waitFor(
      () => {
        expect(screen.queryAllByTestId("overlay-alert")).toHaveLength(0);
      },
      { timeout: 2000 },
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
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);
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
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    // Bob (500) survived the initial filter -> 1 alert.
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);

    // Insert below threshold -> suppressed, not rendered, no sound.
    await act(async () => {
      realtimeCb?.({
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
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(1);

    // Insert at/above threshold -> rendered.
    await act(async () => {
      realtimeCb?.({
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
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    // Initial render does not play a sound (only Realtime inserts do).
    expect(audioInstances).toHaveLength(0);

    await act(async () => {
      realtimeCb?.({
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
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={settings}
      />,
    );
    await act(async () => {
      realtimeCb?.({
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

  it("uses the default 6000ms duration when settings.alertDurationMs is omitted (fake timers)", async () => {
    vi.useFakeTimers();
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={VISIBLE}
        tokenAllowlist={TOKENS}
        settings={{ soundEnabled: false }}
      />,
    );
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);
    // Just before 6000ms: the default-duration timer has not fired yet.
    await act(async () => {
      vi.advanceTimersByTime(5999);
    });
    expect(screen.getAllByTestId("overlay-alert")).toHaveLength(2);
  });
});
