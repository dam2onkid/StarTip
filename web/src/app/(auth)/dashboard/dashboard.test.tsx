import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirect(url);
    // next/navigation redirect throws internally; throw so the component stops.
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("/dashboard shell", () => {
  it("renders Donor and Creator tab placeholders, a Become a Creator affordance, and a logout action", async () => {
    const { DashboardShell } = await import("@/app/(auth)/dashboard/page");
    render(<DashboardShell />);
    expect(
      screen.getByRole("tab", { name: /donor/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /creator/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /become a creator/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log out/i }),
    ).toBeInTheDocument();
  });
});

describe("/dashboard session gating", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockReset();
  });

  it("redirects to /login when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { default: DashboardPage } = await import("@/app/(auth)/dashboard/page");
    await expect(DashboardPage()).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the shell when a session is present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { default: DashboardPage } = await import("@/app/(auth)/dashboard/page");
    const element = await DashboardPage();
    const { container } = render(element);
    expect(container).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
