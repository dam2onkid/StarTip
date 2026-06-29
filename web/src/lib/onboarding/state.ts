/**
 * The four-gate Creator onboarding state machine (CONTEXT.md §Onboarding State,
 * rendered inline in the `/dashboard` Creator tab). Each gate blocks the next.
 *
 *   1. `profile_pending` — no Handle claimed. The "Become a Creator" action
 *      opens the claim Handle form.
 *   2. `wallet_pending` — Handle claimed, no `owner_address`. Prompt to connect
 *      a wallet and sign the link challenge.
 *   3. `onchain_pending` — wallet linked, not registered on-chain. Prompt for
 *      Payout Address and submit `register_creator`.
 *   4. `active` — `onchain_registered = true`. All Creator features unlock.
 *
 * The state is a pure derivation from the Profile's Creator fields, so it can
 * be unit-tested without React or Supabase and shared between the server
 * component (initial render) and the client component (Realtime updates).
 */

export type OnboardingState =
  | "profile_pending"
  | "wallet_pending"
  | "onchain_pending"
  | "active";

export interface OnboardingProfile {
  handle: string | null;
  owner_address: string | null;
  onchain_registered: boolean;
}

export function deriveOnboardingState(
  profile: OnboardingProfile,
): OnboardingState {
  if (profile.onchain_registered) return "active";
  if (!profile.handle) return "profile_pending";
  if (!profile.owner_address) return "wallet_pending";
  return "onchain_pending";
}
