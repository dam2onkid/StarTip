import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Controllable pathname so tests can drive the overlay suppression and the
// active-link highlight without a Next.js router. `vi.hoisted` keeps the
// binding alive before the hoisted `vi.mock` factory runs.
const { pathname } = vi.hoisted(() => ({ pathname: { value: "/" } }));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

// The authed right cluster's avatar menu delegates to `useLogout`, which
// builds the browser Supabase client. Render-only assertions never invoke
// signOut, but the module must resolve. Mock it so no real Supabase client is
// constructed in jsdom.
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn(async () => ({ error: null })) } }),
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
        const MotionComponent = React.forwardRef((props: unknown, ref: unknown) =>
          // Strip motion-only props that have no DOM equivalent.
          React.createElement(tag, { ...(props as object), ref }),
        );
        MotionComponent.displayName = `motion.${tag}`;
        return MotionComponent;
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
const { DonateWalletProvider } = await import(
  "@/components/landing/donate-wallet-context"
);

// SiteNav renders DonateWalletConnector, which reads the shared wallet state
// from DonateWalletProvider. Wrap every render in the provider so the
// connector mounts the same way it does under the root Providers wrapper.
function renderNav(ui: React.ReactElement) {
  return render(<DonateWalletProvider>{ui}</DonateWalletProvider>);
}

/**
 * Unified nav behavior (PRD issue 01). The nav is hoisted into the root
 * layout so it renders on every route except the OBS Overlay. These tests
 * assert on the public structure: the left cluster (logo + Home, Discover,
 * Docs tabs), the removed scroll-spy anchors, the Sign in/up CTA, overlay suppression,
 * and the mobile menu mirroring the left cluster. Motion is an implementation
 * detail of the visual language and is covered by the landing E2E seam.
 */
describe("<SiteNav /> unified nav", () => {
  beforeEach(() => {
    pathname.value = "/";
  });

  it("renders the logo linking home and Home, Discover, Docs tabs", () => {
    renderNav(<SiteNav />);
    expect(screen.getByRole("link", { name: "StarTip home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "href",
      "/creator/explore",
    );
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });

  it("keeps the Sign in/up CTA in the right cluster, retargeted to /login", () => {
    renderNav(<SiteNav />);
    expect(
      screen.getByRole("link", { name: "Sign in/up" }),
    ).toHaveAttribute("href", "/login");
  });

  it("drops the old How it works and Built on Stellar scroll-spy anchors", () => {
    renderNav(<SiteNav />);
    expect(screen.queryByRole("link", { name: /how it works/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /built on stellar/i }),
    ).toBeNull();
  });

  it("suppresses itself on /overlay/* (no nav, logo, links, CTA, or menu toggle)", () => {
    pathname.value = "/overlay/ada";
    renderNav(<SiteNav />);
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "StarTip home" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Discover" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Sign in/up" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /open menu/i })).toBeNull();
  });

  it("suppresses itself on /login and /signup so auth surfaces stay clean", () => {
    for (const path of ["/login", "/signup"]) {
      pathname.value = path;
      const { unmount } = renderNav(<SiteNav />);
      expect(
        screen.queryByRole("navigation", { name: "Primary" }),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: "StarTip home" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Discover" })).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Sign in/up" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: /open menu/i })).toBeNull();
      unmount();
    }
  });

  it("mobile menu reflects the same left links and CTA when opened", async () => {
    renderNav(<SiteNav />);
    // Before opening: only the desktop Discover link is in the DOM.
    expect(screen.getAllByRole("link", { name: "Discover" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

    // After opening: the desktop link + the mobile dropdown link both render.
    const discoverLinks = await screen.findAllByRole("link", {
      name: "Discover",
    });
    expect(discoverLinks).toHaveLength(2);
    const ctaLinks = await screen.findAllByRole("link", {
      name: "Sign in/up",
    });
    expect(ctaLinks).toHaveLength(2);
    // The mobile dropdown Discover link still targets the explore route.
    expect(discoverLinks[1]).toHaveAttribute("href", "/creator/explore");
  });
});

describe("<SiteNav /> authed right cluster", () => {
  beforeEach(() => {
    pathname.value = "/";
    push.mockClear();
  });

  const authed = {
    state: "authenticated",
    displayName: "Fan",
    email: "fan@example.com",
    avatarUrl: null,
  } as const;

  it("replaces the Sign in/up CTA with a notification bell and an avatar menu trigger", () => {
    renderNav(<SiteNav auth={authed} />);
    expect(
      screen.queryByRole("link", { name: "Sign in/up" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /notifications/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account menu for fan/i }),
    ).toBeInTheDocument();
  });

  it("notification bell opens an empty-state dropdown", async () => {
    renderNav(<SiteNav auth={authed} />);
    const bell = screen.getByRole("button", { name: /notifications/i });
    await act(async () => {
      fireEvent.pointerDown(bell, { button: 0 });
      fireEvent.pointerUp(bell);
      fireEvent.click(bell);
    });
    await waitFor(() =>
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument(),
    );
  });

  it("avatar menu opens a header with display_name + email and a Dashboard link to /dashboard", async () => {
    renderNav(<SiteNav auth={authed} />);
    const trigger = screen.getByRole("button", { name: /account menu for fan/i });
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger);
      fireEvent.click(trigger);
    });
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("fan@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("mobile menu mirrors the authed right cluster: Dashboard link + Log out, no CTA", async () => {
    renderNav(<SiteNav auth={authed} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const dash = await screen.findByRole("link", { name: /dashboard/i });
    expect(dash).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("button", { name: /log out/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in/up" }),
    ).toBeNull();
  });
});
