/**
 * `/overlay/[handle]` — public OBS browser source. Subscribes to Supabase
 * Realtime and shows confirmed, visible donations in real time. Placeholder;
 * no behavior yet.
 *
 * `params` is optional in the type so the placeholder can be rendered in tests
 * without a Next.js route context. The real implementation will await the
 * promised `handle` param.
 */
export default function OverlayPage(_props: { params?: Promise<{ handle: string }> } = {}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Overlay</h1>
      <p className="text-muted-foreground">
        OBS browser source overlay. Realtime donation alerts appear here.
        Placeholder.
      </p>
    </section>
  );
}
