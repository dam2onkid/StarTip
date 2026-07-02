import "server-only";

import { env } from "@/lib/env";

/** True when `USE_MOCK_DATA=true` is set in the server env. */
export function isMockDataEnabled(): boolean {
  return env.USE_MOCK_DATA === "true";
}

/**
 * Mock Creator data for local UI testing.
 *
 * Returned by the public discovery surfaces (`/creator/explore` and
 * `/creator/[handle]`) when `USE_MOCK_DATA` is enabled in the server env, so
 * the front-end can be developed and visually tested without a running
 * Supabase stack or a populated remote database.
 *
 * Shapes mirror the rows the real pages feed into `ExplorePageShell` and
 * `CreatorPageShell`: `ExploreCreator` for the list, and the profile + raw
 * donation rows for the per-creator page (aggregated via the real
 * `aggregateLeaderboard` / `sumDonationStats` so the UI exercises the same
 * code paths as production).
 *
 * Handles obey the canonical rules (handle-shared.ts): 3-32 chars, lowercase
 * alphanumeric, hyphens, underscores. Every mock Creator is "active"
 * (onchain_registered = true, paused = false), matching what the
 * `public_profiles` view would expose.
 */

export interface MockCreator {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  /** Cover image. null exercises the default gradient-banner fallback. */
  banner_url: string | null;
  bio: string | null;
}

export interface MockDonation {
  donor_name: string;
  amount: string;
  user_id: string | null;
}

/** The 5 mock Creators shown on `/creator/explore`. */
export const MOCK_CREATORS: MockCreator[] = [
  {
    handle: "nova",
    display_name: "Nova Starlight",
    avatar_url: "https://i.pravatar.cc/200?img=1",
    banner_url: "https://picsum.photos/seed/nova-cover/1600/500",
    bio: "Illustrator drawing constellations. Tips keep the ink flowing.",
  },
  {
    handle: "kenji",
    display_name: "Kenji Watanabe",
    avatar_url: "https://i.pravatar.cc/200?img=2",
    banner_url: "https://picsum.photos/seed/kenji-cover/1600/500",
    bio: "Live coding a retro JRPG every Friday. Support the stream.",
  },
  {
    handle: "luna",
    display_name: "Luna Beats",
    avatar_url: "https://i.pravatar.cc/200?img=3",
    // No cover image: exercises the default gradient-banner fallback.
    banner_url: null,
    bio: "Lo-fi producer. New EP dropping soon, tips fund the masters.",
  },
  {
    handle: "diego",
    display_name: "Diego Maps",
    avatar_url: "https://i.pravatar.cc/200?img=4",
    banner_url: "https://picsum.photos/seed/diego-cover/1600/500",
    bio: "Cartographer hiking every trail and mapping it for you.",
  },
  {
    handle: "amara_writes",
    display_name: "Amara Okafor",
    avatar_url: null,
    banner_url: null,
    bio: "Poet and essayist. Donations buy coffee and time to write.",
  },
];

/**
 * Mock donations per creator handle. `amount` is the raw integer string the
 * real `donations.amount` column holds; the UI converts to display units using
 * token decimals. Rows with a non-null `user_id` contribute to the per-creator
 * and global leaderboards (anonymous donations are excluded, matching
 * `aggregateLeaderboard`).
 */
export const MOCK_DONATIONS: Record<string, MockDonation[]> = {
  nova: [
    { donor_name: "PixelFan", amount: "5000000", user_id: "u-pixelfan" },
    { donor_name: "PixelFan", amount: "2000000", user_id: "u-pixelfan" },
    { donor_name: "StarGazer", amount: "10000000", user_id: "u-stargazer" },
    { donor_name: "Anonymous", amount: "1500000", user_id: null },
  ],
  kenji: [
    { donor_name: "RetroDev", amount: "8000000", user_id: "u-retrodev" },
    { donor_name: "CodeMama", amount: "3000000", user_id: "u-codemama" },
  ],
  luna: [
    { donor_name: "BeatDrop", amount: "12000000", user_id: "u-beatdrop" },
    { donor_name: "LoFiListener", amount: "1000000", user_id: "u-lofi" },
    { donor_name: "LoFiListener", amount: "500000", user_id: "u-lofi" },
  ],
  diego: [
    { donor_name: "TrailHead", amount: "4000000", user_id: "u-trailhead" },
  ],
  amara_writes: [],
};

/** Find a mock Creator by handle (case-insensitive), or null if not found. */
export function getMockCreator(handle: string): MockCreator | null {
  const normalized = handle.trim().toLowerCase();
  return MOCK_CREATORS.find((c) => c.handle === normalized) ?? null;
}

/** Mock donations for a creator handle (empty array if none / unknown). */
export function getMockDonations(handle: string): MockDonation[] {
  const normalized = handle.trim().toLowerCase();
  return MOCK_DONATIONS[normalized] ?? [];
}

/**
 * All mock donations across every creator, for the Global Leaderboard on
 * `/creator/explore`. Flattened from `MOCK_DONATIONS` so the real
 * `aggregateLeaderboard` ranks donors across all creators.
 */
export function allMockDonations(): MockDonation[] {
  return Object.values(MOCK_DONATIONS).flat();
}
