/**
 * `/dashboard` — single tabbed page for the `(auth)` route group.
 *
 * Two tab placeholders lock the tab shape for subsequent feature PRDs: a Donor
 * tab (default role: donation history, rank, edit display name + avatar) and a
 * Creator tab (opt-in: onboarding inline, stats, leaderboard, wallet link,
 * payout, overlay, moderation). No real content yet; the Creator-specific
 * sections will be gated by onboarding state in a later issue.
 */
export default function DashboardPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Dashboard</h1>
      <div role="tablist" aria-label="Dashboard" className="flex gap-2 border-b border-border/40">
        <button role="tab" aria-selected="true" id="donor-tab" className="px-4 py-2 text-sm text-foreground">
          Donor
        </button>
        <button role="tab" aria-selected="false" id="creator-tab" className="px-4 py-2 text-sm text-muted-foreground">
          Creator
        </button>
      </div>
      <div role="tabpanel" aria-labelledby="donor-tab" className="text-muted-foreground">
        Donor tab placeholder: donation history, leaderboard rank, edit display
        name and avatar.
      </div>
      <div role="tabpanel" aria-labelledby="creator-tab" className="text-muted-foreground">
        Creator tab placeholder: onboarding, stats, leaderboard, wallet link,
        payout, overlay, moderation.
      </div>
    </section>
  );
}
