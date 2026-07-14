// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * `useLogout` shared signOut handler (PRD: Unified hybrid navigation, issue 03).
 *
 * The nav avatar menu's "Logout" item (and the dashboard `LogoutButton` when
 * it is mounted) must reuse a single signOut + redirect-to-/login path so the
 * Supabase Auth `signOut` call is not duplicated in two places. The hook returns
 * an async `logout()` function; calling it invokes the browser Supabase client's
 * `auth.signOut`, then forces a full browser navigation to `/login` so the
 * server-rendered nav re-resolves auth against the cleared session cookie.
 */

const signOut = vi.fn(async () => ({ error: null }));
const setHref = vi.fn();

let hrefValue = "";
let originalLocation: Location;

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signOut } }),
}));

beforeEach(() => {
  signOut.mockClear();
  setHref.mockClear();
  hrefValue = "";
  originalLocation = window.location;

  Object.defineProperty(window, "location", {
    value: {
      set href(v: string) {
        setHref(v);
        hrefValue = v;
      },
      get href() {
        return hrefValue;
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    configurable: true,
    writable: true,
  });
});

describe("useLogout", () => {
  it("returns an async logout function", async () => {
    const { useLogout } = await import("./use-logout");
    const { result } = renderHook(() => useLogout());
    expect(typeof result.current).toBe("function");
  });

  it("calls Supabase auth.signOut and then navigates to /login", async () => {
    const { useLogout } = await import("./use-logout");
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current();
    });

    expect(signOut).toHaveBeenCalledOnce();
    expect(setHref).toHaveBeenCalledWith("/login");
    expect(window.location.href).toBe("/login");
    // signOut happens before the navigation.
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      setHref.mock.invocationCallOrder[0],
    );
  });
});
