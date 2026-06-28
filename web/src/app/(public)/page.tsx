import type { Metadata } from "next";
import { LenisProvider } from "@/components/landing/lenis-provider";
import { LandingShell } from "@/components/landing/landing-shell";

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
    <LenisProvider>
      <LandingShell />
    </LenisProvider>
  );
}
