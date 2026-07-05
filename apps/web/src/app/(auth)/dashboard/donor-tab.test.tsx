// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  DonorProfile,
  DonorDonation,
  DonorPerCreatorRank,
} from "@/app/(auth)/dashboard/donor-tab";

/** Donor tab — history and ranks. Profile editing lives in dashboard header. */

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
