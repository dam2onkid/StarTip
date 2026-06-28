import type { VariantProps } from "class-variance-authority";
import type { buttonVariants } from "@/components/ui/button";

/**
 * Landing page content, sourced from
 * `.scratch/web-landing-page/issues/02-landing-full-content.md`.
 *
 * Copy is locked here so the exact-string acceptance criteria are testable
 * independent of the JSX render. Domain vocabulary follows `CONTEXT.md`:
 * Creator, Donor, Donation, Handle, Payout Address, Platform Fee, Overlay.
 */

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export type SecondaryCardCta = {
  label: string;
  href: string;
  /** Secondary or ghost only. Never the Tertiary primary (`default`). */
  variant: Extract<ButtonVariant, "secondary" | "ghost">;
};

export type SecondaryCard = {
  header: string;
  body: string;
  cta: SecondaryCardCta;
};

export type HowItWorksStep = {
  /** Rendered in JetBrains Mono. */
  label: string;
  /** Rendered in Inter. */
  body: string;
};

export type StellarValueProp = {
  heading: string;
  body: string;
};

export const secondaryCards: SecondaryCard[] = [
  {
    header: "Already a Creator?",
    body: "View your donations, moderate messages, and configure your overlay.",
    cta: { label: "Open Dashboard", href: "/dashboard", variant: "secondary" },
  },
  {
    header: "Here to tip?",
    body: "Scan a QR from the stream, or look up a Creator by handle.",
    // Placeholder target. The `/s/[handle]` route is stubbed in a separate issue.
    cta: { label: "Find a Creator", href: "/s", variant: "secondary" },
  },
  {
    header: "How it works",
    body: "A donor scans, picks a Stellar asset, signs one transaction. The contract splits the fee, settles in seconds, and emits proof. The overlay shows the alert.",
    cta: { label: "See the flow", href: "#how-it-works", variant: "secondary" },
  },
];

export const howItWorksSteps: HowItWorksStep[] = [
  {
    label: "01 / Register",
    body: "Create a profile, link your Stellar wallet, and register on-chain. The contract binds your handle to your payout address.",
  },
  {
    label: "02 / Share",
    body: "Get a donate link and QR. Drop the QR on your stream. Add the overlay URL to OBS.",
  },
  {
    label: "03 / Receive",
    body: "Fans donate. The contract settles in seconds, the overlay alerts, your dashboard tracks every tip with on-chain proof.",
  },
];

export const stellarValueProps: StellarValueProp[] = [
  {
    heading: "Fast.",
    body: "Transactions settle in seconds on a ledger built for payments. No waiting on block confirmations, no stuck transfers.",
  },
  {
    heading: "Global.",
    body: "Any wallet, any country. A donor in Tokyo and a creator in Hanoi settle on the same ledger in the same block.",
  },
  {
    heading: "Low fee.",
    body: "A fraction of a cent per transaction. The platform takes a bounded fee, on-chain and capped. The rest reaches the creator.",
  },
];

export const roadmapNote =
  "Stellar's anchor network enables cross-border cash-out to local currencies in 180+ countries. StarTip's MVP settles on Testnet; fiat off-ramp integration is on the roadmap.";
