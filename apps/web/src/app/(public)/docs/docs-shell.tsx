"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NavItem {
  title: string;
  href: string;
}

const navItems: NavItem[] = [
  { title: "Overview", href: "#overview" },
  { title: "How it works", href: "#how-it-works" },
  { title: "Creator setup", href: "#creator-setup" },
  { title: "Donor guide", href: "#donor-guide" },
  { title: "FAQ", href: "#faq" },
];

const faqItems = [
  {
    value: "faq-1",
    question: "Do I need an account to donate?",
    answer:
      "No. You can donate anonymously by connecting a Stellar wallet. Signing in is optional and only needed if you want to appear on leaderboards.",
  },
  {
    value: "faq-2",
    question: "What wallets are supported?",
    answer:
      "Any Stellar wallet that the Stellar Wallets Kit supports, such as Freighter, Rabet, xBull, or Lobstr. The creator wallet must support signMessage to link the owner address.",
  },
  {
    value: "faq-3",
    question: "What tokens can I use?",
    answer:
      "Only tokens in the DonationRouter Token Allowlist. The donate form lists the current allowlist with symbols, names, and icons.",
  },
  {
    value: "faq-4",
    question: "How much is the platform fee?",
    answer:
      "The admin sets a fee in basis points. The contract caps the maximum fee and the rest goes directly to the creator's payout address.",
  },
  {
    value: "faq-5",
    question: "How fast are donations?",
    answer:
      "They settle in seconds on the Stellar network. The overlay shows the alert as soon as the off-chain indexer mirrors the donation event.",
  },
  {
    value: "faq-6",
    question: "Can I change my payout address?",
    answer:
      "Yes. After your creator is active, you can update the payout address from the dashboard and sign the change with your owner wallet.",
  },
  {
    value: "faq-7",
    question: "What is the overlay URL?",
    answer:
      "A private browser-source URL for OBS. It contains an opaque overlay ID, like a stream key. Keep it private and regenerate it if you think it is exposed.",
  },
  {
    value: "faq-8",
    question: "Is this on mainnet or testnet?",
    answer:
      "The MVP is currently on Stellar Testnet. This keeps experimentation fast and low-cost.",
  },
  {
    value: "faq-9",
    question: "Can a creator hide a donation message?",
    answer:
      "Yes. Creators can hide or restore any donation message from the dashboard. Hidden donations still settle on-chain but are not shown on the overlay or public profile.",
  },
];

function SectionCard({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <CardHeader className="gap-4">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary" aria-hidden>
              &gt;
            </span>
            <span className="ml-2">{eyebrow}</span>
          </span>
          <CardTitle className="font-display text-3xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription className="text-base leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}

function StepList({ steps }: { steps: { title: string; description: string }[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.03] font-mono text-sm text-muted-foreground">
            {index + 1}
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocsContent() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pt-32 pb-24">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-display text-display-section mt-4 text-balance text-foreground">
         Documentation
        </h1>
      </section>

      <SectionCard
        id="how-it-works"
        eyebrow="The flow"
        title="How StarTip works"
        description="StarTip replaces traditional payment rails with a Stellar smart contract called DonationRouter. Here is what happens from start to finish."
      >
        <StepList
          steps={[
            {
              title: "Register",
              description:
                "A creator claims a unique handle, connects a Stellar wallet, and sets a payout address. The DonationRouter contract stores the creator on-chain.",
            },
            {
              title: "Share",
              description:
                "The creator gets a public page at /creator/{handle}/donate and a QR code. Share it with your audience so they can tip while you stream.",
            },
            {
              title: "Donate",
              description:
                "A donor opens the link, picks a token from the allowlist, enters an amount, and signs one transaction. The contract splits the platform fee and sends the rest to the creator.",
            },
            {
              title: "Receive",
              description:
                "The creator receives the net amount in their payout address. The overlay shows a donation alert, and the dashboard records the donation with on-chain proof.",
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="creator-setup"
        eyebrow="For creators"
        title="Set up your creator page"
        description="Follow these steps to start receiving tips. You need a Stellar wallet that supports signing messages and a payout address where you want to receive funds."
      >
        <StepList
          steps={[
            {
              title: "Create or sign in to your account",
              description:
                "Create a StarTip account. Your profile is created automatically and gives you access to the creator dashboard.",
            },
            {
              title: "Choose a handle",
              description:
                "Pick a unique handle (3-32 lowercase letters, numbers, hyphens, or underscores). It becomes your public URL and your on-chain identity.",
            },
            {
              title: "Link your wallet",
              description:
                "Connect a Stellar wallet and sign a challenge. This wallet becomes your owner address and controls your creator entry.",
            },
            {
              title: "Set a payout address",
              description:
                "Enter the Stellar address that receives tips. It can be the same wallet or a separate custody address.",
            },
            {
              title: "Register on-chain",
              description:
                "Confirm the registration in your wallet. The DonationRouter records your handle hash, owner address, and payout address.",
            },
            {
              title: "Add the overlay to OBS",
              description:
                "Copy your overlay URL from the dashboard and add it as a browser source. Configure the alert duration, minimum amount, sound, and text-to-speech voice.",
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="donor-guide"
        eyebrow="For donors"
        title="Send a tip in seconds"
        description="You only need a Stellar wallet and a token from the allowlist. You can donate anonymously without creating an account."
      >
        <StepList
          steps={[
            {
              title: "Open the donation page",
              description:
                "Scan the QR code on stream or visit /creator/{handle}/donate. The page loads the creator's public donation form.",
            },
            {
              title: "Connect your wallet",
              description:
                "Use the Stellar Wallets Kit to connect a supported wallet. No sign-up is required to send a donation.",
            },
            {
              title: "Pick a token and amount",
              description:
                "Choose a token from the allowlist, enter the amount, and optionally add your name and a message. Quick-select buttons help with common amounts.",
            },
            {
              title: "Sign and confirm",
              description:
                "Approve the transaction in your wallet. The donation settles in seconds and the overlay shows the alert if the amount is above the creator's minimum.",
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="faq"
        eyebrow="FAQ"
        title="Questions and answers"
        description="Common questions about wallets, tokens, fees, and how the platform works."
      >
        <Accordion type="single" collapsible defaultValue="faq-1">
          {faqItems.map((item) => (
            <AccordionItem key={item.value} value={item.value}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>

      <Card>
        <CardContent className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Ready to start?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create your account, claim a handle, and receive your first on-chain tip.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/login">
              Get started
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}


