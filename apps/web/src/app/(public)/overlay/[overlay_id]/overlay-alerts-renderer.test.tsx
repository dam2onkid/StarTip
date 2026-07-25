// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { planRender } from "@startip/shared/overlay/renderer";
import { OverlayAlerts, type OverlayDonation } from "./overlay-alerts";

vi.mock("@startip/shared/overlay/renderer", () => ({
  planRender: vi.fn(),
}));

/**
 * Overlay shared renderer integration tests.
 *
 * The browser fallback must consume the same `@startip/shared/overlay/renderer`
 * `planRender` path as the Live Event Client. These tests mock the shared
 * renderer to prove `OverlayAlerts` calls it and renders the returned
 * Donation Alert plan. This protects the shared-behavior seam without relying
 * on the real primary acceptance flow (Playwright).
 */
describe("OverlayAlerts - shared renderer", () => {
  beforeEach(() => {
    vi.mocked(planRender).mockImplementation((input, deps) => ({
      ok: true,
      plan: {
        type: "donation-alert",
        donorName: input.donorName,
        amountDisplay: `${input.amountDisplay} (shared)`,
        tokenSymbol: `(${input.tokenSymbol})`,
        message: input.message ? `${input.message} (shared)` : null,
        startedAt: 0,
        durationMs: deps.alertDurationMs ?? 10000,
        endsAt: (deps.alertDurationMs ?? 10000),
      },
    }));
  });

  it("renders a donation through the shared Donation Alert renderer", () => {
    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[
          {
            id: "d1",
            donor_name: "Ada",
            amount: "100",
            token: "CUSDC",
            message: "Thanks",
            created_at: "t",
          },
        ]}
        tokenAllowlist={[{ contract_address: "CUSDC", symbol: "USDC" }]}
        settings={{ alertDurationMs: 1500, soundEnabled: false }}
      />,
    );

    expect(planRender).toHaveBeenCalledWith(
      expect.objectContaining({
        donorName: "Ada",
        amountDisplay: "100",
        tokenSymbol: "USDC",
        message: "Thanks",
        effect: null,
      }),
      { alertDurationMs: 1500 },
    );

    expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Ada");
    expect(screen.getByTestId("alert-amount")).toHaveTextContent("100 (shared)");
    expect(screen.getByTestId("alert-symbol")).toHaveTextContent("(USDC)");
    expect(screen.getByTestId("alert-message")).toHaveTextContent("\"Thanks (shared)\"");
  });

  it("degrades an effect donation to a normal Donation Alert", () => {
    const donation = {
      id: "d1",
      donor_name: "Ada",
      amount: "100",
      token: "CUSDC",
      message: "Thanks",
      created_at: "t",
      effect: { effect_id: "jump-scare" },
    } as OverlayDonation;

    render(
      <OverlayAlerts
        creatorProfileId="c1"
        initialDonations={[donation]}
        tokenAllowlist={[{ contract_address: "CUSDC", symbol: "USDC" }]}
        settings={{ soundEnabled: false }}
      />,
    );

    expect(planRender).toHaveBeenCalledWith(
      expect.objectContaining({ effect: null }),
      expect.anything(),
    );
    expect(screen.getByTestId("alert-donor-name")).toHaveTextContent("Ada");
    expect(screen.queryByText("Jump Scare")).toBeNull();
  });
});
