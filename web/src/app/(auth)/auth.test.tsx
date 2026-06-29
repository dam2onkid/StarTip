import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AuthLayout from "@/app/(auth)/layout";
import { DashboardShell } from "@/app/(auth)/dashboard/page";
import LoginPage from "@/app/(public)/login/page";
import { ExplorePageShell } from "@/app/(public)/creator/explore/page";
import { CreatorPageShell } from "@/app/(public)/creator/[handle]/page";
import DonatePage from "@/app/(public)/creator/[handle]/donate/page";
import OverlayPage from "@/app/(public)/overlay/[handle]/page";
import DocsPage from "@/app/(public)/docs/page";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    auth: { signInWithOtp: vi.fn(), signOut: vi.fn() },
    // No-op Realtime channel so the CreatorTab mount does not throw in jsdom.
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
    removeChannel: vi.fn(),
    // DonateForm reads the token allowlist on mount.
    from: () => ({
      select: () => ({ then: (cb: (r: { data: unknown[]; error: unknown }) => unknown) => Promise.resolve(cb({ data: [], error: null })) }),
    }),
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("(auth) route group", () => {
  it("layout renders the StarTip wordmark and a dashboard nav link", () => {
    render(
      <AuthLayout>
        <p>child</p>
      </AuthLayout>,
    );
    expect(screen.getByText("StarTip")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("dashboard shell renders Donor and Creator tab placeholders", () => {
    render(<DashboardShell />);
    expect(
      screen.getByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /donor/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /creator/i })).toBeInTheDocument();
  });
});

describe("public route placeholders", () => {
  it("/login renders a placeholder heading", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("/creator/explore renders the explore heading and creator list shell", () => {
    render(
      <ExplorePageShell
        creators={[
          { handle: "ada", display_name: "Ada Lovelace", avatar_url: null },
        ]}
        leaderboard={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /explore creators/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ada lovelace/i }),
    ).toHaveAttribute("href", "/creator/ada");
  });

  it("/creator/[handle] renders the creator shell with profile, stats, and donate CTA", () => {
    render(
      <CreatorPageShell
        handle="ada"
        displayName="Ada Lovelace"
        avatarUrl={null}
        bio="Pioneer programmer."
        total="350"
        count={2}
        leaderboard={[{ donor_name: "Bob", total_amount: "500" }]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /ada lovelace/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("total-received")).toHaveTextContent("350");
    expect(screen.getByTestId("donation-count")).toHaveTextContent("2");
    expect(screen.getByTestId("donate-cta")).toHaveAttribute(
      "href",
      "/creator/ada/donate",
    );
  });

  it("/creator/[handle]/donate renders a donate heading", async () => {
    await act(async () => {
      render(<DonatePage params={Promise.resolve({ handle: "ada" })} />);
    });
    expect(
      screen.getByRole("heading", { name: /donate to ada/i }),
    ).toBeInTheDocument();
  });

  it("/overlay/[handle] renders a placeholder heading", () => {
    render(<OverlayPage />);
    expect(
      screen.getByRole("heading", { name: /overlay/i }),
    ).toBeInTheDocument();
  });

  it("/docs renders a placeholder heading", () => {
    render(<DocsPage />);
    expect(
      screen.getByRole("heading", { name: /docs/i }),
    ).toBeInTheDocument();
  });
});
