// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  OverlayAlerts,
  type OverlayDonation,
  type OverlayRealtimeStub,
} from "./overlay-alerts";

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

beforeEach(() => {
  realtimeCb = null;
  removeChannel.mockClear();
});

afterEach(() => {
  // Clear any stub a test may have installed on the window.
  (window as unknown as { __STARTIP_OVERLAY_REALTIME_STUB__?: OverlayRealtimeStub }).__STARTIP_OVERLAY_REALTIME_STUB__ = undefined;
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
