/**
 * `/creator/[handle]` — public Creator page: profile, donation stats,
 * per-creator leaderboard, donate CTA. Placeholder; no behavior yet.
 *
 * `params` is optional in the type so the placeholder can be rendered in tests
 * without a Next.js route context. The real implementation will await the
 * promised `handle` param.
 */
export default function CreatorPage(_props: { params?: Promise<{ handle: string }> } = {}) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Creator</h1>
      <p className="text-muted-foreground">
        Public Creator profile, stats, per-creator leaderboard, and donate CTA.
        Placeholder.
      </p>
    </section>
  );
}
