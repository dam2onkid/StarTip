// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

/**
 * LiveEventsSettingsCard unit tests.
 *
 * The card fetches the public Live Events configuration for the creator,
 * renders the opt-in toggle and four price inputs, and PUTs updates back to
 * the owner endpoint. Tests assert loading defaults, toggling, server-side
 * validation error surfacing, and successful save.
 */

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const next = calls.shift();
    if (!next) throw new Error(`unexpected fetch ${url.toString()}`);
    return next(url.toString(), init);
  }) as unknown as typeof fetch;
}

const defaultResponse = {
  live_events_enabled: true,
  effects: {
    "screen-flash": { name: "Screen Flash", price: 1 },
    "jump-scare": { name: "Jump Scare", price: 2 },
    "tunnel-vision": { name: "Tunnel Vision", price: 3 },
    "screen-cover": { name: "Screen Cover", price: 5 },
  },
};

describe("LiveEventsSettingsCard", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    mockFetch([
      () => jsonRes(200, defaultResponse),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the toggle and four price inputs after loading", async () => {
    const { LiveEventsSettingsCard } = await import("./live-events");
    render(
      <TooltipProvider>
        <LiveEventsSettingsCard handle="ada" />
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("live-events-settings-card")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("live-events-enabled-toggle")).toBeChecked();
    expect(screen.getByTestId("live-events-price-screen-flash")).toHaveValue(1);
    expect(screen.getByTestId("live-events-price-jump-scare")).toHaveValue(2);
    expect(screen.getByTestId("live-events-price-tunnel-vision")).toHaveValue(3);
    expect(screen.getByTestId("live-events-price-screen-cover")).toHaveValue(5);
  });

  it("toggles Live Events Enabled and saves with updated prices", async () => {
    const saveResponse = {
      live_events_enabled: false,
      prices: {
        "screen-flash": 1.5,
        "jump-scare": 2.5,
        "tunnel-vision": 3.5,
        "screen-cover": 5.5,
      },
    };
    mockFetch([
      () => jsonRes(200, defaultResponse),
      () => jsonRes(200, saveResponse),
    ]);

    const { LiveEventsSettingsCard } = await import("./live-events");
    render(
      <TooltipProvider>
        <LiveEventsSettingsCard handle="ada" />
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("live-events-enabled-toggle")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("live-events-enabled-toggle"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("live-events-price-screen-flash"), {
        target: { value: "1.5" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("live-events-settings-save"));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(toastSuccess.mock.calls[0][0]).toBe("Live Events settings saved.");

    const putCall = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1];
    expect(putCall[0]).toContain("/api/creators/ada/live-events");
    const body = JSON.parse(putCall[1].body as string);
    expect(body.live_events_enabled).toBe(false);
    expect(body.prices["screen-flash"]).toBe(1.5);
  });

  it("surfaces a server validation error when a price is below the floor", async () => {
    mockFetch([
      () => jsonRes(200, defaultResponse),
      () => jsonRes(400, { error: "price_below_floor" }),
    ]);

    const { LiveEventsSettingsCard } = await import("./live-events");
    render(
      <TooltipProvider>
        <LiveEventsSettingsCard handle="ada" />
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("live-events-enabled-toggle")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId("live-events-price-screen-flash"), {
        target: { value: "0.05" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("live-events-settings-save"));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError.mock.calls[0][0]).toBe("Prices cannot be below the 0.10 test USDC platform floor.");
  });
});
