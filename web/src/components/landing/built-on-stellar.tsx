import { roadmapNote, stellarValueProps } from "@/content/landing";

/**
 * "Built on Stellar" section. Three MVP-true value props plus a roadmap note
 * that frames cross-border cash-out as a Stellar ecosystem roadmap capability,
 * not an MVP feature. Static Server Component.
 */
export function BuiltOnStellar() {
  return (
    <section
      aria-label="Built on Stellar"
      className="mx-auto w-full max-w-5xl border-t border-muted-foreground/20 px-6 py-24 sm:py-32"
    >
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Built on Stellar
      </h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        {stellarValueProps.map((prop) => (
          <div key={prop.heading} className="flex flex-col gap-3">
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              {prop.heading}
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">
              {prop.body}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {roadmapNote}
      </p>
    </section>
  );
}
