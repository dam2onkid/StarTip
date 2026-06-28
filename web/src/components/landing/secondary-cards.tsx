import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { secondaryCards } from "@/content/landing";

/**
 * Three secondary cards below the hero. Card CTAs use the secondary Button
 * variant so the hero "Become a Creator" CTA remains the single Tertiary
 * element on the page at rest (single-accent rule, DESIGN.md).
 */
export function SecondaryCards() {
  return (
    <section
      aria-label="Next steps"
      className="mx-auto w-full max-w-5xl px-6 pb-24 sm:pb-32"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {secondaryCards.map((card) => (
          <Card
            key={card.header}
            className="border border-muted-foreground/40 bg-card ring-0"
          >
            <CardHeader>
              <CardTitle className="font-mono text-sm tracking-wide text-foreground">
                {card.header}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {card.body}
              </p>
              <div className="mt-auto">
                <Button asChild variant={card.cta.variant} size="lg">
                  <Link href={card.cta.href}>{card.cta.label}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
