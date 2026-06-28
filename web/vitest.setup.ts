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
