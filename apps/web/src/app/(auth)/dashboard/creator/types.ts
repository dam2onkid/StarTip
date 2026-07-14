import type { OnboardingProfile } from "@/lib/onboarding/state";
import type { TokenAllowlistEntry } from "@/lib/donations/token";

/**
 * A profile row with all Creator fields plus the onboarding state fields.
 */
export interface CreatorProfile extends OnboardingProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  banner_url?: string | null;
  bio: string | null;
  /** On-chain payout address; set by the indexer after `CreatorRegistered`. */
  payout_address?: string | null;
  /** Opaque token for the private OBS browser source. */
  overlay_id?: string | null;
  /** Mirrored by the indexer from `CreatorActiveChanged` (`paused = !active`). */
  paused?: boolean;
}

/** A received-donation row for the moderation list (creator RLS, all columns). */
export interface CreatorDonationRow {
  id: string;
  donor_name: string;
  amount: string;
  token: string;
  message: string | null;
  donor_address: string | null;
  user_id: string | null;
  status: string;
  moderation_status: string;
  created_at: string;
}

/** Active-features data loaded server-side and passed into the active panel. */
export interface CreatorActiveData {
  stats: { total: string; count: number; token?: string };
  leaderboard: { donor_name: string; total_amount: string; token?: string }[];
  recent: CreatorDonationRow[];
  /** Precomputed donation-goal progress snapshot, or `null` when no goal is set. */
  goal?: { current: string; target: string; pct: number; token: string } | null;
}

export interface CreatorTabProps {
  profile: CreatorProfile;
  activeData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}

export type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "pending"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export type CreatorSettingsTab =
  | "overview"
  | "profile"
  | "payout"
  | "overlay"
  | "moderation";

/**
 * Test seam: when `window.__STARTIP_REALTIME_STUB__` is present (injected by
 * the Playwright E2E harness), the hook registers the callback with the stub
 * instead of opening a Realtime channel. This lets E2E drive the
 * `onchain_pending → active` flip deterministically without a WebSocket.
 */
export interface RealtimeStub {
  subscribe(onActive: (next: Partial<CreatorProfile>) => void): () => void;
}

declare global {
  interface Window {
    __STARTIP_REALTIME_STUB__?: RealtimeStub;
  }
}
