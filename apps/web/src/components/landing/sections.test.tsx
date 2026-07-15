import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Problem } from "@/components/landing/problem";
import { Solution } from "@/components/landing/solution";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BuiltOnStellar } from "@/components/landing/built-on-stellar";
import { UseCases } from "@/components/landing/use-cases";
import { SocialProof } from "@/components/landing/social-proof";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import {
  faqItems,
  finalCta,
  heroContent,
  howItWorksSteps,
  problemSection,
  socialProofItems,
  solutionSection,
  stellarValueProps,
  useCases,
} from "@/content/landing";

// MatchMedia is not implemented in jsdom. The prefers-reduced-motion hook
// returns `false` when the query is unavailable, so the components will attempt
// to use Framer Motion. Provide a minimal mock to keep ScrambleText/Magnetic
// hooks happy.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

describe("landing sections", () => {
  it("Problem renders the headline and pain points", () => {
    render(<Problem />);
    expect(screen.getByRole("region", { name: /the problem/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: problemSection.headline }),
    ).toBeInTheDocument();
    for (const point of problemSection.painPoints) {
      expect(screen.getByText(point.label)).toBeInTheDocument();
      expect(screen.getByText(point.value)).toBeInTheDocument();
    }
  });

  it("Solution renders the headline and both role paths", () => {
    render(<Solution />);
    expect(screen.getByRole("region", { name: /the fix/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: solutionSection.headline }),
    ).toBeInTheDocument();
    for (const path of solutionSection.paths) {
      expect(
        screen.getByText(new RegExp(`> ${path.role}$`, "i")),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: path.cta })).toHaveAttribute(
        "href",
        path.href,
      );
    }
  });

  it("HowItWorks renders all three steps", () => {
    render(<HowItWorks />);
    const section = screen.getByRole("region", { name: /how it works/i });
    expect(section).toBeInTheDocument();
    for (const step of howItWorksSteps) {
      expect(screen.getByText(step.body)).toBeInTheDocument();
    }
  });

  it("BuiltOnStellar renders all three value props", () => {
    render(<BuiltOnStellar />);
    const section = screen.getByRole("region", { name: /built on stellar/i });
    expect(section).toBeInTheDocument();
    for (const prop of stellarValueProps) {
      expect(
        screen.getByRole("heading", { name: prop.heading }),
      ).toBeInTheDocument();
      expect(screen.getByText(prop.body)).toBeInTheDocument();
    }
  });

  it("UseCases renders every creator persona", () => {
    render(<UseCases />);
    const section = screen.getByRole("region", { name: /use cases/i });
    expect(section).toBeInTheDocument();
    for (const useCase of useCases) {
      expect(
        screen.getByRole("heading", { name: useCase.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(useCase.body)).toBeInTheDocument();
    }
  });

  it("SocialProof renders all trust signals", () => {
    render(<SocialProof />);
    const section = screen.getByRole("region", { name: /trust signals/i });
    expect(section).toBeInTheDocument();
    for (const proof of socialProofItems) {
      expect(screen.getByText(proof.value)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(proof.label, "i"))).toBeInTheDocument();
    }
  });

  it("Faq renders every question", () => {
    render(<Faq />);
    const section = screen.getByRole("region", {
      name: /frequently asked questions/i,
    });
    expect(section).toBeInTheDocument();
    for (const item of faqItems) {
      expect(screen.getByText(item.question)).toBeInTheDocument();
    }
  });

  it("FinalCta unauthenticated renders the public primary CTA", () => {
    render(<FinalCta auth={{ state: "unauthenticated" }} />);
    const section = screen.getByRole("region", { name: /final call to action/i });
    expect(section).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: finalCta.headline }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: finalCta.cta.label }),
    ).toHaveAttribute("href", finalCta.cta.href);
  });

  it("FinalCta authenticated switches to the dashboard CTA", () => {
    render(
      <FinalCta
        auth={{
          state: "authenticated",
          displayName: "Fan",
          email: "fan@example.com",
          avatarUrl: null,
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: heroContent.authenticatedCta.label }),
    ).toHaveAttribute("href", heroContent.authenticatedCta.href);
  });
});
