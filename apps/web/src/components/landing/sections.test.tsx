import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SecondaryCards } from "@/components/landing/secondary-cards";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { secondaryCards } from "@/content/landing";

describe("<SecondaryCards />", () => {
  it("renders all three card headers, bodies, and CTA labels", () => {
    render(<SecondaryCards />);
    for (const card of secondaryCards) {
      // ScrambleText renders both a visible (aria-hidden) and an sr-only copy
      // of animated headers, so getByText would match twice.
      expect(screen.getAllByText(card.header).length).toBeGreaterThan(0);
      expect(screen.getByText(card.body)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: card.cta.label }),
      ).toBeInTheDocument();
    }
  });

  it("card 1 CTA links to /dashboard and card 3 CTA links to #how-it-works", () => {
    render(<SecondaryCards />);
    expect(
      screen.getByRole("link", { name: "Open Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("link", { name: "See the flow" }),
    ).toHaveAttribute("href", "#how-it-works");
  });

  it("card CTAs do not use the Tertiary primary background at rest", () => {
    const { container } = render(<SecondaryCards />);
    const primaryButtons = container.querySelectorAll(".bg-primary");
    expect(primaryButtons).toHaveLength(0);
  });
});

describe("<HowItWorks />", () => {
  it("renders a section with id=how-it-works and the three step labels and bodies", () => {
    render(<HowItWorks />);
    const section = document.getElementById("how-it-works");
    expect(section).not.toBeNull();
    expect(screen.getByText("01 / Register")).toBeInTheDocument();
    expect(screen.getByText("02 / Share")).toBeInTheDocument();
    expect(screen.getByText("03 / Receive")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a profile, link your Stellar wallet, and register on-chain. The contract binds your handle to your payout address.",
      ),
    ).toBeInTheDocument();
  });
});

describe("<BuiltOnStellar />", () => {
  it("renders the three value prop headings and bodies plus the roadmap note", () => {
    render(<BuiltOnStellar />);
    // ScrambleText renders both a visible (aria-hidden) and an sr-only copy
    // of animated headings, so getByText would match twice.
    expect(screen.getAllByText("Fast.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Global.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Low fee.").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Stellar's anchor network enables cross-border cash-out to local currencies in 180+ countries. StarTip's MVP settles on Testnet; fiat off-ramp integration is on the roadmap.",
      ),
    ).toBeInTheDocument();
  });
});
