/**
 * `/creator/[handle]/donate` — public donate form: token picker, wallet
 * connect, message, amount. Placeholder; no behavior yet.
 *
 * `params` is optional in the type so the placeholder can be rendered in tests
 * without a Next.js route context. The real implementation will await the
 * promised `handle` param.
 */
export default function DonatePage(_props: { params?: Promise<{ handle: string }> } = {}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Donate</h1>
      <p className="text-muted-foreground">
        Donate form with token picker, wallet connect, message, and amount.
        Placeholder.
      </p>
    </section>
  );
}
