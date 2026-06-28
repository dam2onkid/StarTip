import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthLayout from "@/app/(auth)/layout";
import OnboardingPage from "@/app/(auth)/onboarding/page";
import DashboardPage from "@/app/(auth)/dashboard/page";
import ProfilePage from "@/app/(auth)/dashboard/profile/page";
import WalletPage from "@/app/(auth)/dashboard/wallet/page";
import PayoutPage from "@/app/(auth)/dashboard/payout/page";
import OverlaySettingsPage from "@/app/(auth)/dashboard/overlay/page";
import DonationsPage from "@/app/(auth)/dashboard/donations/page";

describe("(auth) route group placeholders", () => {
  it("layout renders the StarTip wordmark and placeholder nav links", () => {
    render(
      <AuthLayout>
        <p>child</p>
      </AuthLayout>,
    );
    expect(screen.getByText("StarTip")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    // Placeholder nav links to the dashboard sub-routes exist.
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("onboarding page renders a placeholder heading", () => {
    render(<OnboardingPage />);
    expect(
      screen.getByRole("heading", { name: /onboarding coming soon/i }),
    ).toBeInTheDocument();
  });

  it("dashboard page renders a placeholder heading", () => {
    render(<DashboardPage />);
    expect(
      screen.getByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  const subroutes: Array<[string, RegExp, React.ComponentType]> = [
    ["profile", /profile/i, ProfilePage],
    ["wallet", /wallet/i, WalletPage],
    ["payout", /payout/i, PayoutPage],
    ["overlay", /overlay/i, OverlaySettingsPage],
    ["donations", /donations/i, DonationsPage],
  ];

  for (const [slug, match, Component] of subroutes) {
    it(`dashboard/${slug} renders a placeholder heading`, () => {
      render(<Component />);
      expect(screen.getByRole("heading", { name: match })).toBeInTheDocument();
    });
  }
});
