import { describe, expect, it } from "vitest";
import {
  faqItems,
  finalCta,
  heroContent,
  howItWorksSteps,
  problemSection,
  secondaryCards,
  socialProofItems,
  solutionSection,
  stellarValueProps,
  useCases,
} from "./landing";

describe("landing content", () => {
  it("hero exposes both authenticated and unauthenticated CTAs", () => {
    expect(heroContent.unauthenticatedCta.label).toBe("Create your tip page");
    expect(heroContent.unauthenticatedCta.href).toBe("/login");
    expect(heroContent.authenticatedCta.label).toBe("Open dashboard");
    expect(heroContent.authenticatedCta.href).toBe("/dashboard");
    expect(heroContent.secondaryCta.label).toBe("Send a tip");
    expect(heroContent.secondaryCta.href).toBe("/creator/explore");
  });

  it("hero copy is user-facing and avoids unsupported claims", () => {
    expect(heroContent.headline).toMatch(/tip/i);
    expect(heroContent.subheadline).toMatch(/scan/i);
  });

  it("problem section defines concrete pain points", () => {
    expect(problemSection.headline).toMatch(/broken/i);
    expect(problemSection.painPoints).toHaveLength(3);
    const labels = problemSection.painPoints.map((p) => p.label);
    expect(labels).toContain("Platform fee");
    expect(labels).toContain("Settlement");
    expect(labels).toContain("Chargebacks");
  });

  it("solution section offers creator and fan paths", () => {
    expect(solutionSection.headline).toMatch(/QR/i);
    expect(solutionSection.paths).toHaveLength(2);
    const roles = solutionSection.paths.map((p) => p.role);
    expect(roles).toContain("Creator");
    expect(roles).toContain("Fan");
  });

  it("how-it-works steps are ordered and label/body pairs", () => {
    expect(howItWorksSteps).toHaveLength(3);
    expect(howItWorksSteps[0]?.label).toMatch(/01/);
    expect(howItWorksSteps[1]?.label).toMatch(/02/);
    expect(howItWorksSteps[2]?.label).toMatch(/03/);
    for (const step of howItWorksSteps) {
      expect(step.body.length).toBeGreaterThan(20);
    }
  });

  it("stellar value props keep fast/global/low-fee as MVP-true", () => {
    expect(stellarValueProps).toHaveLength(3);
    const headings = stellarValueProps.map((v) => v.heading);
    expect(headings).toContain("Fast.");
    expect(headings).toContain("Global.");
    expect(headings).toContain("Low fee.");
  });

  it("stellar roadmap note frames cross-border cash-out as roadmap", () => {
    expect(stellarValueProps.some((v) => v.body.toLowerCase().includes("cash-out"))).toBe(false);
  });

  it("use cases are user-facing and non-empty", () => {
    expect(useCases.length).toBeGreaterThan(0);
    for (const useCase of useCases) {
      expect(useCase.title.length).toBeGreaterThan(0);
      expect(useCase.body.length).toBeGreaterThan(10);
    }
  });

  it("social proof items include specific numbers", () => {
    expect(socialProofItems).toHaveLength(3);
    const labels = socialProofItems.map((i) => i.label);
    expect(labels).toContain("to settle");
    expect(labels).toContain("platform fee");
    expect(labels).toContain("markets via Stellar anchors");
  });

  it("faq questions answer wallet, fee, mainnet, moderation, and failures", () => {
    const questions = faqItems.map((f) => f.question.toLowerCase());
    expect(questions.some((q) => q.includes("wallet"))).toBe(true);
    expect(questions.some((q) => q.includes("fee"))).toBe(true);
    expect(questions.some((q) => q.includes("mainnet"))).toBe(true);
    expect(questions.some((q) => q.includes("moderate") || q.includes("hide"))).toBe(true);
    expect(questions.some((q) => q.includes("fail"))).toBe(true);
  });

  it("final CTA links to login", () => {
    expect(finalCta.cta.label).toBe("Create your tip page");
    expect(finalCta.cta.href).toBe("/login");
  });

  it("secondary cards remain available for backwards compatibility", () => {
    expect(secondaryCards).toHaveLength(3);
    expect(secondaryCards[0]?.cta.variant).not.toBe("default");
  });
});
