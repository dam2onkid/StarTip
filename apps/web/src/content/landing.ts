import type { VariantProps } from "class-variance-authority";
import type { buttonVariants } from "@/components/ui/button";

/**
 * Landing page content source of truth.
 *
 * Copy lives here so marketing text, acceptance tests, and component renders
 * stay in sync. When updating the homepage, change this file first, then update
 * the matching unit and E2E assertions.
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

export type HeroContent = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  authenticatedCta: { label: string; href: string };
  unauthenticatedCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
};

export type PainPoint = {
  label: string;
  value: string;
  note: string;
};

export type SolutionPath = {
  role: string;
  body: string;
  cta: string;
  href: string;
};

export type SocialProofItem = {
  value: string;
  label: string;
};

export type UseCase = {
  title: string;
  body: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export const heroContent: HeroContent = {
  eyebrow: "Tipping rail · Stellar",
  headline: "Get tipped globally. Keep almost all of it.",
  subheadline:
    "StarTip lets livestream creators accept tips from anywhere in seconds. Fans scan, pick an amount, and send. No complicated setup. No waiting days to get paid.",
  authenticatedCta: { label: "Open dashboard", href: "/dashboard" },
  unauthenticatedCta: { label: "Create your tip page", href: "/login" },
  secondaryCta: { label: "Send a tip", href: "/creator/explore" },
};

export const problemSection = {
  eyebrow: "> The problem",
  headline: "Tipping is broken.",
  body:
    "Creators lose up to 30% to middlemen. Fans bounce at checkout. Payouts take days. And setup means forms, verification, and hoping the platform lets you keep the money.",
  painPoints: [
    { label: "Platform fee", value: "30%", note: "typical on legacy tips" },
    { label: "Settlement", value: "3-5 days", note: "before you can spend it" },
    { label: "Chargebacks", value: "reversible", note: "funds held by the platform" },
  ] as PainPoint[],
};

export const solutionSection = {
  eyebrow: "> The fix",
  headline: "One QR. One contract. Done.",
  body:
    "Claim a handle, link your Stellar wallet, and share your public tip page. Fans scan the QR, pick a token, and sign one transaction. The contract splits the fee, settles in seconds, and proves every donation on-chain.",
  paths: [
    {
      role: "Creator",
      body:
        "Get a public donation page, a QR, and an OBS overlay. The contract sends tips straight to your wallet.",
      cta: "Create your page",
      href: "/login",
    },
    {
      role: "Fan",
      body:
        "Find a creator, scan a QR, and send any Stellar asset. No account needed beyond a wallet.",
      cta: "Send a tip",
      href: "/creator/explore",
    },
  ] as SolutionPath[],
};

export const howItWorksSteps: HowItWorksStep[] = [
  {
    label: "01 / Create",
    body:
      "Claim a handle, link your Stellar wallet, and register on-chain. The contract binds your handle to your payout address.",
  },
  {
    label: "02 / Share",
    body:
      "Get a donate link and QR. Drop the QR on your stream. Add the overlay URL to OBS.",
  },
  {
    label: "03 / Get tipped",
    body:
      "Fans scan, pick a token and amount, and sign. The contract settles in seconds and the overlay alerts in real time.",
  },
];

export const stellarValueProps: StellarValueProp[] = [
  {
    heading: "Fast.",
    body:
      "Tips settle in seconds on a network built for payments. No pending balances. No stuck transfers.",
  },
  {
    heading: "Global.",
    body:
      "One wallet, any country. A fan in São Paulo and a creator in Seoul settle on the same ledger.",
  },
  {
    heading: "Low fee.",
    body:
      "A fraction of a cent per transaction. The platform fee is capped in the contract. The rest reaches the creator.",
  },
];

export const roadmapNote =
  "Stellar's anchor network enables cross-border cash-out to local currencies in 180+ countries. StarTip's MVP settles on Testnet; fiat off-ramp integration is on the roadmap.";

export const useCases: UseCase[] = [
  {
    title: "Livestreamers",
    body:
      "Display alerts, text-to-speech messages, and donation goals on OBS while fans tip from any wallet.",
  },
  {
    title: "Musicians",
    body:
      "Let listeners tip during live sets without setting up a store or waiting for payouts.",
  },
  {
    title: "Podcasters",
    body:
      "Add a tip link to show notes or live chat. Fans support the show in two taps.",
  },
  {
    title: "Community builders",
    body:
      "Collect support without passing it through a platform that takes a big cut.",
  },
];

export const socialProofItems: SocialProofItem[] = [
  { value: "< 5s", label: "to settle" },
  { value: "1%", label: "platform fee" },
  { value: "180+", label: "markets via Stellar anchors" },
];

export const faqItems: FaqItem[] = [
  {
    question: "Do I need a Stellar wallet?",
    answer:
      "Yes. Creators link a wallet to receive payouts. Fans need any Stellar-compatible wallet to send tips.",
  },
  {
    question: "How much is the fee?",
    answer:
      "The platform fee is 1%, capped at 5% by the contract. No hidden charges.",
  },
  {
    question: "Is this on mainnet?",
    answer:
      "The current MVP runs on Stellar Testnet. Mainnet migration is on the roadmap.",
  },
  {
    question: "Can I hide or moderate tips?",
    answer:
      "Yes. Creators can review messages and hide donations from the overlay and dashboard.",
  },
  {
    question: "What happens if a transaction fails?",
    answer:
      "The donation is only recorded after on-chain verification. Failed transactions do not show up.",
  },
];

export const finalCta = {
  eyebrow: "> Start",
  headline: "Start getting tipped today.",
  body:
    "Set up your StarTip page in under a minute. No subscription. No waiting for approval.",
  cta: { label: "Create your tip page", href: "/login" },
};

/**
 * @deprecated Kept for backwards compatibility with existing imports. New code
 * should use `solutionSection.paths` instead.
 */
export const secondaryCards: SecondaryCard[] = [
  {
    header: "Create your page",
    body:
      "Claim a handle, link your Stellar wallet, and get a public donation page plus an OBS overlay.",
    cta: { label: "Start as creator", href: "/login", variant: "secondary" },
  },
  {
    header: "Send a tip",
    body:
      "Scan a QR from the stream or browse creators. Pick a token, enter an amount, and sign one transaction.",
    cta: { label: "Find a creator", href: "/creator/explore", variant: "secondary" },
  },
  {
    header: "See how it works",
    body:
      "One QR, one smart contract, instant alerts. The contract splits the fee, settles in seconds, and emits on-chain proof.",
    cta: { label: "See the flow", href: "#how-it-works", variant: "secondary" },
  },
];
