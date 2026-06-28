import { howItWorksSteps } from "@/content/landing";

/**
 * "How it works" section. Static for now, no Framer Motion, no Lenis. The
 * motion layer lands in a separate issue. Step labels render in JetBrains Mono
 * (`font-mono`), step body copy in Inter (body default).
 */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-5xl scroll-mt-24 border-t border-muted-foreground/20 px-6 py-24 sm:py-32"
    >
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        How it works
      </h2>
      <ol className="mt-12 grid gap-8 sm:grid-cols-3">
        {howItWorksSteps.map((step) => (
          <li key={step.label} className="flex flex-col gap-3">
            <p className="font-mono text-sm tracking-wide text-muted-foreground">
              {step.label}
            </p>
            <p className="text-base leading-relaxed text-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
