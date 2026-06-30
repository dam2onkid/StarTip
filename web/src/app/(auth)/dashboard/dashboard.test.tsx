import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const getUser = vi.fn();
const serverFrom = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: serverFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: serviceFrom,
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
  it("renders Donor and Creator tabs, a Become a Creator affordance, and a logout action", async () => {
    const { DashboardShell } = await import("@/app/(auth)/dashboard/page");
    render(<DashboardShell />);
    expect(
      screen.getByRole("tab", { name: /donor/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /creator/i }),
    ).toBeInTheDocument();
    // Creator tab content is mounted only when the Creator tab is active
    // (the shell now does a real tab switch instead of rendering both panels
    // at once).
    fireEvent.click(screen.getByRole("tab", { name: /creator/i }));
    expect(
      await screen.findByRole("button", { name: /become a creator/i }),
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
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("redirects to /login when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { default: DashboardPage } = await import("@/app/(auth)/dashboard/page");
    await expect(DashboardPage()).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the shell when a session is present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    // Session client: profiles (maybeSingle) + donations (array, ordered).
    const profileChain = {
      select: vi.fn(() => profileChain),
      eq: vi.fn(() => profileChain),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "p1",
          user_id: "u1",
          display_name: "Ada",
          avatar_url: null,
          handle: null,
          owner_address: null,
          onchain_registered: false,
          payout_address: null,
        },
        error: null,
      })),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    const donationsChain = {
      select: vi.fn(() => donationsChain),
      eq: vi.fn(() => donationsChain),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    serverFrom.mockImplementation((table: string) =>
      table === "profiles" ? profileChain : donationsChain,
    );
    // Service client: donations (array) + profiles (array).
    const serviceDonationsChain = {
      select: vi.fn(() => serviceDonationsChain),
      in: vi.fn(() => serviceDonationsChain),
      eq: vi.fn(async () => ({ data: [], error: null })),
    };
    const serviceProfilesChain = {
      select: vi.fn(() => serviceProfilesChain),
      in: vi.fn(async () => ({ data: [], error: null })),
    };
    serviceFrom.mockImplementation((table: string) =>
      table === "donations" ? serviceDonationsChain : serviceProfilesChain,
    );
    const { default: DashboardPage } = await import("@/app/(auth)/dashboard/page");
    const element = await DashboardPage();
    const { container } = render(element);
    expect(container).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
