import { describe, it, expect } from "vitest";
import {
  secondaryCards,
  howItWorksSteps,
  stellarValueProps,
  roadmapNote,
  type SecondaryCard,
} from "@/content/landing";

describe("secondary cards", () => {
  it("renders exactly three cards in the specified order", () => {
    expect(secondaryCards).toHaveLength(3);
  });

  it("card 1 is the returning-Creator dashboard card", () => {
    const card = secondaryCards[0] as SecondaryCard;
    expect(card.header).toBe("Already a Creator?");
    expect(card.body).toBe(
      "View your donations, moderate messages, and configure your overlay.",
    );
    expect(card.cta.label).toBe("Open Dashboard");
    expect(card.cta.href).toBe("/dashboard");
  });

  it("card 2 is the donor entry card with a placeholder finder link", () => {
    const card = secondaryCards[1] as SecondaryCard;
    expect(card.header).toBe("Here to tip?");
    expect(card.body).toBe(
      "Scan a QR from the stream, or look up a Creator by handle.",
    );
    expect(card.cta.label).toBe("Find a Creator");
    expect(card.cta.href).toBe("/s");
  });

  it("card 3 is the how-it-works card linking to the in-page anchor", () => {
    const card = secondaryCards[2] as SecondaryCard;
    expect(card.header).toBe("How it works");
    expect(card.body).toBe(
      "A donor scans, picks a Stellar asset, signs one transaction. The contract splits the fee, settles in seconds, and emits proof. The overlay shows the alert.",
    );
    expect(card.cta.label).toBe("See the flow");
    expect(card.cta.href).toBe("#how-it-works");
  });

  it("card CTAs use a secondary or ghost variant, never the Tertiary primary", () => {
    for (const card of secondaryCards) {
      expect(["secondary", "ghost"]).toContain(card.cta.variant);
      expect(card.cta.variant).not.toBe("default");
    }
  });
});

describe("how it works steps", () => {
  it("renders exactly three steps in order", () => {
    expect(howItWorksSteps).toHaveLength(3);
  });

  it("step 01 is Register", () => {
    expect(howItWorksSteps[0].label).toBe("01 / Register");
    expect(howItWorksSteps[0].body).toBe(
      "Create a profile, link your Stellar wallet, and register on-chain. The contract binds your handle to your payout address.",
    );
  });

  it("step 02 is Share", () => {
    expect(howItWorksSteps[1].label).toBe("02 / Share");
    expect(howItWorksSteps[1].body).toBe(
      "Get a donate link and QR. Drop the QR on your stream. Add the overlay URL to OBS.",
    );
  });

  it("step 03 is Receive", () => {
    expect(howItWorksSteps[2].label).toBe("03 / Receive");
    expect(howItWorksSteps[2].body).toBe(
      "Fans donate. The contract settles in seconds, the overlay alerts, your dashboard tracks every tip with on-chain proof.",
    );
  });
});

describe("built on Stellar value props", () => {
  it("renders exactly three value props in order", () => {
    expect(stellarValueProps).toHaveLength(3);
  });

  it("Fast prop", () => {
    expect(stellarValueProps[0].heading).toBe("Fast.");
    expect(stellarValueProps[0].body).toBe(
      "Transactions settle in seconds on a ledger built for payments. No waiting on block confirmations, no stuck transfers.",
    );
  });

  it("Global prop", () => {
    expect(stellarValueProps[1].heading).toBe("Global.");
    expect(stellarValueProps[1].body).toBe(
      "Any wallet, any country. A donor in Tokyo and a creator in Hanoi settle on the same ledger in the same block.",
    );
  });

  it("Low fee prop", () => {
    expect(stellarValueProps[2].heading).toBe("Low fee.");
    expect(stellarValueProps[2].body).toBe(
      "A fraction of a cent per transaction. The platform takes a bounded fee, on-chain and capped. The rest reaches the creator.",
    );
  });

  it("roadmap note frames cross-border cash-out as a future capability", () => {
    expect(roadmapNote).toBe(
      "Stellar's anchor network enables cross-border cash-out to local currencies in 180+ countries. StarTip's MVP settles on Testnet; fiat off-ramp integration is on the roadmap.",
    );
  });
});
