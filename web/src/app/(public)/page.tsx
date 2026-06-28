import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Fast, global tipping for livestream creators, settled on Stellar",
  description:
    "Fans scan a QR and send a Stellar asset. The transaction settles in seconds, anywhere in the world, for a fraction of a cent. Every donation is bound to an on-chain proof the platform cannot forge.",
  openGraph: {
    title:
      "StarTip — Fast, global tipping for livestream creators, settled on Stellar",
    description:
      "Fans scan a QR and send a Stellar asset. The transaction settles in seconds, anywhere in the world, for a fraction of a cent. Every donation is bound to an on-chain proof the platform cannot forge.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "StarTip — Fast, global tipping for livestream creators, settled on Stellar",
    description:
      "Fans scan a QR and send a Stellar asset. The transaction settles in seconds, anywhere in the world, for a fraction of a cent. Every donation is bound to an on-chain proof the platform cannot forge.",
  },
};

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-32 sm:py-40">
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Fast, global tips for livestream creators. Settled on Stellar.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Fans scan a QR and send a Stellar asset. The transaction settles in
          seconds, anywhere in the world, for a fraction of a cent. Every
          donation is bound to an on-chain proof the platform cannot forge.
        </p>
        <div>
          <Button asChild size="lg">
            <Link href="/onboarding">Become a Creator</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
