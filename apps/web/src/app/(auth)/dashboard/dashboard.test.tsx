import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// jsdom's `URL.createObjectURL` returns an opaque `blob:nodedata:` URL that
// is unique per call and hard to assert on. The profile dialog uses it to
// preview a locally picked avatar/background before Save uploads it. Stub it
// to a stable string so the preview flow is testable.
URL.createObjectURL = vi.fn(() => "blob:mock://preview");
URL.revokeObjectURL = vi.fn();

const getUser = vi.fn();
const serverFrom = vi.fn();
const serviceFrom = vi.fn();
const updateEq = vi.fn();
const fromUpdate = vi.fn();
const storageUpload = vi.fn();
const storageGetPublicUrl = vi.fn();
const fromStorage = vi.fn();
const fromTable = vi.fn();
const channel = vi.fn();
const removeChannel = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: serverFrom,
  })),
}));

vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: serviceFrom,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    from: fromTable,
    storage: { from: fromStorage },
    channel,
    removeChannel,
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
  beforeEach(() => {
    fromTable.mockReset();
    fromStorage.mockReset();
    fromUpdate.mockReset();
    updateEq.mockReset();
    storageUpload.mockReset();
    storageGetPublicUrl.mockReset();
    channel.mockReset();
    removeChannel.mockReset();

    updateEq.mockReturnValue({ error: null });
    fromUpdate.mockReturnValue({ eq: updateEq });
    fromTable.mockReturnValue({ update: fromUpdate });
    storageUpload.mockResolvedValue({ error: null });
    storageGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.storage/avatars/u1/1.png" },
    });
    fromStorage.mockReturnValue({
      upload: storageUpload,
      getPublicUrl: storageGetPublicUrl,
    });
    const realtimeChannel = {
      on: vi.fn(() => realtimeChannel),
      subscribe: vi.fn(() => realtimeChannel),
    };
    channel.mockReturnValue(realtimeChannel);
  });

  it("renders Donor and Creator tabs, a Become a Creator affordance, and no logout action", async () => {
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
      screen.queryByRole("button", { name: /log out/i }),
    ).not.toBeInTheDocument();
  });

  it("updates display_name from the dashboard info dialog", async () => {
    const { DashboardShell } = await import("@/app/(auth)/dashboard/page");
    render(
      <DashboardShell
        creatorProfile={{
          id: "p1",
          user_id: "u1",
          display_name: "Ada",
          avatar_url: null,
          bio: null,
          handle: null,
          owner_address: null,
          onchain_registered: false,
          paused: false,
        }}
      />,
    );

    expect(screen.queryByText(/^Active$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit creator profile/i }));
    const input = screen.getByLabelText(/^name$/i);
    const bioInput = screen.getByLabelText(/bio/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    });
    await act(async () => {
      fireEvent.change(bioInput, { target: { value: "Math pioneer." } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-status")).toHaveTextContent(/saved/i);
    });
    expect(fromUpdate).toHaveBeenCalledWith({
      display_name: "Ada Lovelace",
      bio: "Math pioneer.",
    });
    expect(updateEq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("uploads and removes creator profile background from the header dialog", async () => {
    const { DashboardShell } = await import("@/app/(auth)/dashboard/page");
    render(
      <DashboardShell
        creatorProfile={{
          id: "p1",
          user_id: "u1",
          display_name: "Ada",
          avatar_url: null,
          banner_url: "https://example.storage/avatars/u1/old.png",
          bio: "Pioneer programmer.",
          handle: "ada",
          owner_address: "G-OWNER",
          onchain_registered: true,
          paused: false,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit creator profile/i }));
    const file = new File(["banner"], "cover.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("creator-background-input"), {
        target: { files: [file] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("creator-profile-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("save-status")).toHaveTextContent(/saved/i);
    });
    expect(storageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^u1\/banner-\d+\.png$/),
      file,
      { cacheControl: "3600", upsert: false },
    );
    expect(fromUpdate).toHaveBeenCalledWith({
      display_name: "Ada",
      bio: "Pioneer programmer.",
      banner_url: "https://example.storage/avatars/u1/1.png",
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("creator-background-remove"));
    });
    await waitFor(() => {
      expect(fromUpdate).toHaveBeenLastCalledWith({ banner_url: null });
    });
  });

  it("shows a local preview of a picked avatar and background before saving", async () => {
    const { DashboardShell } = await import("@/app/(auth)/dashboard/page");
    render(
      <DashboardShell
        creatorProfile={{
          id: "p1",
          user_id: "u1",
          display_name: "Ada",
          avatar_url: null,
          banner_url: null,
          bio: null,
          handle: null,
          owner_address: null,
          onchain_registered: false,
          paused: false,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit creator profile/i }));

    // No preview or "New" badge before a file is picked.
    expect(screen.queryByTestId("creator-avatar-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creator-background-pending")).not.toBeInTheDocument();

    const avatarFile = new File(["avatar"], "face.png", { type: "image/png" });
    const bannerFile = new File(["banner"], "cover.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("creator-avatar-input"), {
        target: { files: [avatarFile] },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("creator-background-input"), {
        target: { files: [bannerFile] },
      });
    });

    // The locally picked image is rendered immediately (blob URL) and a
    // "New" badge marks it as unsaved so the user knows it was added.
    expect(screen.getByTestId("creator-avatar-preview-pending")).toHaveAttribute(
      "src",
      "blob:mock://preview",
    );
    expect(screen.getByTestId("creator-avatar-pending")).toHaveTextContent(/new/i);
    expect(screen.getByTestId("creator-background-preview")).toHaveAttribute(
      "src",
      "blob:mock://preview",
    );
    expect(screen.getByTestId("creator-background-pending")).toHaveTextContent(/new/i);
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
