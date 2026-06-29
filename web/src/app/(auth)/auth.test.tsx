import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthLayout from "@/app/(auth)/layout";
import { DashboardShell } from "@/app/(auth)/dashboard/page";
import LoginPage from "@/app/(public)/login/page";
import ExplorePage from "@/app/(public)/creator/explore/page";
import CreatorPage from "@/app/(public)/creator/[handle]/page";
import DonatePage from "@/app/(public)/creator/[handle]/donate/page";
import OverlayPage from "@/app/(public)/overlay/[handle]/page";
import DocsPage from "@/app/(public)/docs/page";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signInWithOtp: vi.fn(), signOut: vi.fn() } }),
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

  it("/creator/explore renders a placeholder heading", () => {
    render(<ExplorePage />);
    expect(
      screen.getByRole("heading", { name: /explore/i }),
    ).toBeInTheDocument();
  });

  it("/creator/[handle] renders a placeholder heading", () => {
    render(<CreatorPage />);
    expect(
      screen.getByRole("heading", { name: /creator/i }),
    ).toBeInTheDocument();
  });

  it("/creator/[handle]/donate renders a placeholder heading", () => {
    render(<DonatePage />);
    expect(
      screen.getByRole("heading", { name: /donate/i }),
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
