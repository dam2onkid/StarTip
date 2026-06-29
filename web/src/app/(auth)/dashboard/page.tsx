import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/(auth)/dashboard/logout-button";
import { CreatorTab, type CreatorProfile } from "@/app/(auth)/dashboard/creator-tab";

/**
 * `/dashboard` — authed shell for the `(auth)` route group.
 *
 * Reads the Supabase session via `lib/supabase/server.ts` and redirects to
 * `/login` when there is no user. Otherwise loads the caller's Profile's
 * Creator fields and renders the tabbed shell: a Donor tab (default role) and a
 * Creator tab that runs the four-gate onboarding state machine inline.
 */
export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,handle,owner_address,onchain_registered,payout_address")
    .eq("user_id", user.id)
    .maybeSingle();

  const creatorProfile: CreatorProfile = profile
    ? {
        id: profile.id,
        handle: profile.handle,
        owner_address: profile.owner_address,
        onchain_registered: profile.onchain_registered,
        payout_address: profile.payout_address,
      }
    : // No profile row yet (should not happen — autocreate trigger) — start at
      // gate 1 with a synthetic id so Realtime can still attach if one appears.
      { id: "", handle: null, owner_address: null, onchain_registered: false };

  return <DashboardShell creatorProfile={creatorProfile} />;
}

/**
 * Presentational shell for the dashboard. Exported so tests can render the tab
 * structure without going through the async session gate. `creatorProfile` is
 * optional so the shell can render in a default `profile_pending` state.
 */
export function DashboardShell({ creatorProfile }: { creatorProfile?: CreatorProfile }) {
  const profile: CreatorProfile =
    creatorProfile ?? { id: "", handle: null, owner_address: null, onchain_registered: false };
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-24">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Dashboard</h1>
        <LogoutButton />
      </div>
      <div role="tablist" aria-label="Dashboard" className="flex gap-2 border-b border-border/40">
        <button role="tab" aria-selected="true" id="donor-tab" className="px-4 py-2 text-sm text-foreground">
          Donor
        </button>
        <button role="tab" aria-selected="false" id="creator-tab" className="px-4 py-2 text-sm text-muted-foreground">
          Creator
        </button>
      </div>
      <div role="tabpanel" aria-labelledby="donor-tab" className="flex flex-col gap-3 text-muted-foreground">
        <p>Donor tab placeholder: donation history, leaderboard rank, edit display name and avatar.</p>
      </div>
      <div role="tabpanel" aria-labelledby="creator-tab">
        <CreatorTab profile={profile} />
      </div>
    </section>
  );
}
