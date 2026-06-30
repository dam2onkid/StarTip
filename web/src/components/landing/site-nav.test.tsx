import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Controllable pathname so tests can drive the overlay suppression and the
// active-link highlight without a Next.js router. `vi.hoisted` keeps the
// binding alive before the hoisted `vi.mock` factory runs.
const { pathname } = vi.hoisted(() => ({ pathname: { value: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

// Neutralize Framer Motion so the test asserts on rendered structure, not on
// the motion layer (jsdom does not implement scroll/viewport behavior the
// `useScroll` hook relies on). `vi.importActual` pulls the real React so the
// mock can create host elements without referencing a pre-hoisted import.
vi.mock("framer-motion", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const motion = new Proxy(
    {},
    {
      get: (_t, key) => {
        const tag = String(key);
        return React.forwardRef((props: unknown, ref: unknown) =>
          // Strip motion-only props that have no DOM equivalent.
          React.createElement(tag, { ...(props as object), ref }),
        );
      },
    },
  );
  const noopValue = {
    get: () => 0,
    set: () => undefined,
    on: () => () => undefined,
  };
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      children != null ? React.createElement(React.Fragment, null, children) : null,
    useScroll: () => ({
      get: () => 0,
      getPrevious: () => 0,
      set: () => undefined,
      on: () => () => undefined,
    }),
    useMotionValueEvent: () => undefined,
    useMotionValue: () => noopValue,
    useSpring: () => noopValue,
  };
});

const { SiteNav } = await import("@/components/landing/site-nav");

/**
 * Unified nav behavior (PRD issue 01). The nav is hoisted into the root
 * layout so it renders on every route except the OBS Overlay. These tests
 * assert on the public structure: the left cluster (logo + Discover), the
 * removed scroll-spy anchors, the Become a Creator CTA, overlay suppression,
 * and the mobile menu mirroring the left cluster. Motion is an implementation
 * detail of the visual language and is covered by the landing E2E seam.
 */
describe("<SiteNav /> unified nav", () => {
  beforeEach(() => {
    pathname.value = "/";
  });

  it("renders the logo linking home and a Discover link to /creator/explore", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "StarTip home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "href",
      "/creator/explore",
    );
  });

  it("keeps the Become a Creator CTA in the right cluster", () => {
    render(<SiteNav />);
    expect(
      screen.getByRole("link", { name: "Become a Creator" }),
    ).toHaveAttribute("href", "/login");
  });

  it("drops the old How it works and Built on Stellar scroll-spy anchors", () => {
    render(<SiteNav />);
    expect(screen.queryByRole("link", { name: /how it works/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /built on stellar/i }),
    ).toBeNull();
  });

  it("suppresses itself on /overlay/* (no nav, logo, links, CTA, or menu toggle)", () => {
    pathname.value = "/overlay/ada";
    render(<SiteNav />);
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "StarTip home" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Discover" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Become a Creator" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /open menu/i })).toBeNull();
  });

  it("mobile menu reflects the same left links and CTA when opened", async () => {
    render(<SiteNav />);
    // Before opening: only the desktop Discover link is in the DOM.
    expect(screen.getAllByRole("link", { name: "Discover" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

    // After opening: the desktop link + the mobile dropdown link both render.
    const discoverLinks = await screen.findAllByRole("link", {
      name: "Discover",
    });
    expect(discoverLinks).toHaveLength(2);
    const ctaLinks = await screen.findAllByRole("link", {
      name: "Become a Creator",
    });
    expect(ctaLinks).toHaveLength(2);
    // The mobile dropdown Discover link still targets the explore route.
    expect(discoverLinks[1]).toHaveAttribute("href", "/creator/explore");
  });
});
