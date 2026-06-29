import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/app/(auth)/dashboard/logout-button";

/**
 * `/dashboard` — authed shell for the `(auth)` route group.
 *
 * Reads the Supabase session via `lib/supabase/server.ts` and redirects to
 * `/login` when there is no user. Otherwise renders the tabbed shell: a Donor
 * tab (default role) and a Creator tab (opt-in). The Donor tab includes a
 * "Become a Creator" affordance so the onboarding slice can wire it later.
 */
export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell />;
}

/**
 * Presentational shell for the dashboard. Exported so tests can render the
 * tab structure without going through the async session gate.
 */
export function DashboardShell() {
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
        <Button type="button" className="self-start">
          Become a Creator
        </Button>
      </div>
      <div role="tabpanel" aria-labelledby="creator-tab" className="text-muted-foreground">
        Creator tab placeholder: onboarding, stats, leaderboard, wallet link, payout, overlay, moderation.
      </div>
    </section>
  );
}
