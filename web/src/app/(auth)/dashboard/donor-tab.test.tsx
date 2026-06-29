// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type {
  DonorProfile,
  DonorDonation,
  DonorPerCreatorRank,
} from "@/app/(auth)/dashboard/donor-tab";

/**
 * Donor tab — history, ranks, and profile edit (display_name + avatar upload).
 * The browser Supabase client is mocked so the form interactions can be
 * exercised without a real backend. Tests assert on rendered text and the
 * side-effect calls made to the mocked client (storage.upload, profiles.update).
 */

const updateEq = vi.fn();
const updateObj = vi.fn();
const fromUpdate = vi.fn();
const storageUpload = vi.fn();
const storageGetPublicUrl = vi.fn();
const fromStorage = vi.fn();
const fromTable = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    from: fromTable,
    storage: { from: fromStorage },
  })),
}));

beforeEach(() => {
  fromTable.mockReset();
  fromStorage.mockReset();
  fromUpdate.mockReset();
  updateEq.mockReset();
  updateObj.mockReset();
  storageUpload.mockReset();
  storageGetPublicUrl.mockReset();

  // Default: profiles.update succeeds.
  updateObj.mockReturnValue({ error: null });
  updateEq.mockReturnValue({ error: null });
  fromUpdate.mockReturnValue({ eq: updateEq });
  fromTable.mockReturnValue({ update: fromUpdate });

  // Default: storage.upload succeeds, getPublicUrl returns a URL.
  storageUpload.mockResolvedValue({ error: null });
  storageGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://example.storage/avatars/u1/1.png" },
  });
  fromStorage.mockReturnValue({
    upload: storageUpload,
    getPublicUrl: storageGetPublicUrl,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function profile(over: Partial<DonorProfile> = {}): DonorProfile {
  return {
    id: "p1",
    user_id: "u1",
    display_name: "Ada",
    avatar_url: null,
    ...over,
  };
}

function donation(over: Partial<DonorDonation> = {}): DonorDonation {
  return {
    id: "d1",
    token: "USDC",
    amount: "100",
    message: null,
    donor_name: "Ada",
    status: "confirmed",
    created_at: "2026-06-01T00:00:00Z",
    creator_profile_id: "c1",
    ...over,
  };
}

function perCreator(over: Partial<DonorPerCreatorRank> = {}): DonorPerCreatorRank {
  return {
    creator_profile_id: "c1",
    handle: "ada",
    display_name: "Ada Lovelace",
    rank: 2,
    total: "350",
    ...over,
  };
}

describe("DonorTab — history and ranks rendering", () => {
  it("renders the donation history with amount, token, and status", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile()}
        donations={[donation({ amount: "500", token: "USDC", status: "confirmed" })]}
        globalRank={{ rank: 2, total: "500" }}
        perCreatorRanks={[perCreator()]}
      />,
    );
    const history = screen.getByTestId("donor-history");
    expect(history).toBeInTheDocument();
    expect(history).toHaveTextContent("500");
    expect(history).toHaveTextContent("USDC");
    expect(history).toHaveTextContent("confirmed");
  });

  it("renders an empty-state message when there are no donations", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile()}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    expect(screen.getByText(/have not donated yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("donor-history")).toBeNull();
  });

  it("renders the global rank when present", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile()}
        donations={[]}
        globalRank={{ rank: 3, total: "750" }}
        perCreatorRanks={[]}
      />,
    );
    const rank = screen.getByTestId("global-rank");
    expect(rank).toHaveTextContent("#3");
    expect(rank).toHaveTextContent("750");
  });

  it("renders an empty-state message when global rank is null", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile()}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    expect(screen.getByText(/No tracked donations yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("global-rank")).toBeNull();
  });

  it("renders per-creator ranks with handle and rank", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile()}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[
          perCreator({ handle: "ada", display_name: "Ada Lovelace", rank: 1 }),
          perCreator({
            creator_profile_id: "c2",
            handle: "bob",
            display_name: "Bob",
            rank: 5,
          }),
        ]}
      />,
    );
    const ranks = screen.getByTestId("per-creator-ranks");
    expect(ranks).toHaveTextContent("Ada Lovelace");
    expect(ranks).toHaveTextContent("@ada");
    expect(ranks).toHaveTextContent("#1");
    expect(ranks).toHaveTextContent("Bob");
    expect(ranks).toHaveTextContent("@bob");
    expect(ranks).toHaveTextContent("#5");
  });
});

describe("DonorTab — profile edit", () => {
  it("updates display_name via the owner UPDATE RLS path on save", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile({ display_name: "Ada" })}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    const input = screen.getByLabelText(/display name/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("save-status")).toHaveTextContent(/saved/i);
    });
    expect(fromUpdate).toHaveBeenCalledWith({ display_name: "Ada Lovelace" });
    expect(updateEq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("falls back to Anonymous when the display name is blank", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile({ display_name: "Ada" })}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    const input = screen.getByLabelText(/display name/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "   " } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    });
    await waitFor(() => {
      expect(fromUpdate).toHaveBeenCalledWith({ display_name: "Anonymous" });
    });
  });

  it("uploads the avatar to the avatars bucket and stores the public URL", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    render(
      <DonorTab
        profile={profile({ user_id: "u1" })}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    const fileInput = screen.getByTestId("avatar-input") as HTMLInputElement;
    const file = new File(["bytes"], "me.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("save-status")).toHaveTextContent(/saved/i);
    });
    // Uploaded to the avatars bucket under the user's folder.
    expect(storageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^u1\/\d+\.png$/),
      file,
      expect.objectContaining({ cacheControl: "3600", upsert: false }),
    );
    expect(storageGetPublicUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^u1\/\d+\.png$/),
    );
    // The public URL is stored as avatar_url on the profile.
    expect(fromUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar_url: "https://example.storage/avatars/u1/1.png",
      }),
    );
  });

  it("surfaces an error when the profile update fails", async () => {
    const { DonorTab } = await import("@/app/(auth)/dashboard/donor-tab");
    updateEq.mockReturnValue({ error: { message: "RLS denied" } });
    render(
      <DonorTab
        profile={profile()}
        donations={[]}
        globalRank={{ rank: null, total: "0" }}
        perCreatorRanks={[]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/RLS denied/i);
    });
  });
});
