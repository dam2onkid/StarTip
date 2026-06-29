/**
 * `/docs` — static documentation placeholder. A home for documentation in the
 * future; no behavior yet. Renders the "Documentation coming soon" placeholder
 * so visitors who follow a Docs link land on a clear, intentional page.
 */
export default function DocsPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Docs</h1>
      <p className="text-muted-foreground" data-testid="docs-placeholder">
        Documentation coming soon.
      </p>
    </section>
  );
}
