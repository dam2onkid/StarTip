import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { howItWorksSteps } from "@/content/landing";

// Hoisted mutable state shared with the hoisted `vi.mock` factories below.
const { lenisDisabled, lenisConstructor } = vi.hoisted(() => ({
  lenisDisabled: { value: "false" },
  lenisConstructor: vi.fn(),
}));

// Mock the `lenis` module so constructing it is observable without bringing in
// its DOM scroll-hijack behavior or rAF loop in jsdom. A class is used so the
// default export is constructable with `new Lenis(...)`.
vi.mock("lenis", () => ({
  default: class MockLenis {
    constructor() {
      lenisConstructor();
    }
    raf = vi.fn();
    destroy = vi.fn();
  },
}));

// Mock the env module so the NEXT_PUBLIC_LENIS_DISABLED flag is controllable
// per test without depending on process.env load order. The getter reads the
// hoisted mutable value lazily so per-test mutations take effect.
vi.mock("@/lib/env", () => ({
  env: {
    get NEXT_PUBLIC_LENIS_DISABLED() {
      return lenisDisabled.value;
    },
  },
}));

// Import after mocks are registered so the components see the mocked modules.
const { HowItWorks } = await import("@/components/landing/how-it-works");
const { LenisProvider } = await import("@/components/landing/lenis-provider");
const { usePrefersReducedMotion } = await import(
  "@/hooks/use-prefers-reduced-motion"
);

/**
 * Motion layer behavior tests (issue 04). These assert on observable behavior:
 * the reduced-motion preference gates Framer Motion reveals and Lenis smooth
 * scrolling, and the `NEXT_PUBLIC_LENIS_DISABLED` env flag gates Lenis
 * independently. They do not assert on Framer Motion variant objects or
 * component internals (per PRD testing philosophy).
 */

type MatchMediaMatcher = (query: string) => {
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null;
  addEventListener: (
    type: string,
    listener: (ev: MediaQueryListEvent) => void,
  ) => void;
  removeEventListener: (type: string, listener: (ev: MediaQueryListEvent) => void) => void;
  dispatchEvent: (event: Event) => boolean;
};

let reducedMotion = false;
const matchMediaSpies = vi.fn();

function installMatchMedia() {
  const impl: (query: string) => MediaQueryList = (query: string) => {
    matchMediaSpies(query);
    const matches =
      query === "(prefers-reduced-motion: reduce)" && reducedMotion;
    const listeners = new Set<(ev: MediaQueryListEvent) => void>();
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: (
        _type: string,
        listener: (ev: MediaQueryListEvent) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (ev: MediaQueryListEvent) => void,
      ) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
  vi.stubGlobal("matchMedia", impl as unknown as MatchMediaMatcher);
}

beforeEach(() => {
  reducedMotion = false;
  matchMediaSpies.mockReset();
  installMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("usePrefersReducedMotion", () => {
  it("returns false when the OS preference is no-preference", () => {
    function Probe() {
      const reduced = usePrefersReducedMotion();
      return <div data-testid="probe">{reduced ? "reduced" : "ok"}</div>;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("ok");
  });

  it("returns true when the OS preference is reduce", () => {
    reducedMotion = true;
    function Probe() {
      const reduced = usePrefersReducedMotion();
      return <div data-testid="probe">{reduced ? "reduced" : "ok"}</div>;
    }
    const { rerender } = render(<Probe />);
    // The hook reads matchMedia in an effect; rerender to flush the state update.
    rerender(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("reduced");
  });
});

describe("<HowItWorks /> motion gating", () => {
  it("renders the section, heading, and all three steps by default (no-preference)", () => {
    render(<HowItWorks />);
    expect(document.getElementById("how-it-works")).not.toBeNull();
    // The heading is animated by ScrambleText, which renders both a visible
    // (aria-hidden) and an sr-only copy of the text.
    expect(screen.getAllByText("How it works").length).toBeGreaterThan(0);
    for (const step of howItWorksSteps) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
      expect(screen.getByText(step.body)).toBeInTheDocument();
    }
  });

  it("renders steps as visible plain list items when prefers-reduced-motion: reduce", () => {
    reducedMotion = true;
    const { rerender } = render(<HowItWorks />);
    // Flush the effect-driven state update from the reduced-motion hook.
    rerender(<HowItWorks />);
    const list = document.querySelector("#how-it-works ol");
    expect(list).not.toBeNull();
    const items = list!.querySelectorAll("li");
    expect(items).toHaveLength(3);
    // Static path: no inline opacity:0 hiding the steps before they enter view.
    for (const item of items) {
      expect((item as HTMLElement).style.opacity).not.toBe("0");
    }
  });
});

describe("<LenisProvider /> gating", () => {
  beforeEach(() => {
    lenisConstructor.mockClear();
    lenisDisabled.value = "false";
  });

  it("renders its children regardless of motion or env state", () => {
    render(
      <LenisProvider>
        <p>child</p>
      </LenisProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("initializes Lenis when no-preference and the env flag is not true", async () => {
    render(
      <LenisProvider>
        <p>child</p>
      </LenisProvider>,
    );
    await waitFor(() => expect(lenisConstructor).toHaveBeenCalledTimes(1));
  });

  it("does not initialize Lenis when prefers-reduced-motion: reduce", () => {
    reducedMotion = true;
    const { rerender } = render(
      <LenisProvider>
        <p>child</p>
      </LenisProvider>,
    );
    rerender(
      <LenisProvider>
        <p>child</p>
      </LenisProvider>,
    );
    expect(lenisConstructor).not.toHaveBeenCalled();
  });

  it("does not initialize Lenis when NEXT_PUBLIC_LENIS_DISABLED=true", () => {
    lenisDisabled.value = "true";
    render(
      <LenisProvider>
        <p>child</p>
      </LenisProvider>,
    );
    expect(lenisConstructor).not.toHaveBeenCalled();
  });
});
