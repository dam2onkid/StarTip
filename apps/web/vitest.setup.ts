import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom does not implement `window.matchMedia`. Provide a minimal polyfill so
// hooks that subscribe to media queries (e.g. `usePrefersReducedMotion`) work
// in tests. Defaults to `matches: false` (no-preference); individual tests can
// override via `vi.stubGlobal("matchMedia", ...)` to simulate `reduce`.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom does not implement `IntersectionObserver`. Provide a minimal polyfill so
// Framer Motion `whileInView` reveals mount without error in tests. The polyfill
// reports every observed element as immediately intersecting so content is
// visible in the rendered output.
if (
  typeof window !== "undefined" &&
  typeof window.IntersectionObserver !== "function"
) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [0];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
  }
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = window.IntersectionObserver;
}

// jsdom does not implement `ResizeObserver`. Provide a minimal polyfill so
// Framer Motion `useScroll` (which may observe layout) mounts without error.
if (
  typeof window !== "undefined" &&
  typeof window.ResizeObserver !== "function"
) {
  class MockResizeObserver implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = window.ResizeObserver;
}
