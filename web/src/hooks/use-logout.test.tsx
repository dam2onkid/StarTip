// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * `useLogout` shared signOut handler (PRD: Unified hybrid navigation, issue 03).
 *
 * Both the dashboard `LogoutButton` and the nav avatar menu's "Logout" item
 * must reuse a single signOut + redirect-to-/login path so the Supabase Auth
 * `signOut` call is not duplicated in two places. The hook returns an async
 * `logout()` function; calling it invokes the browser Supabase client's
 * `auth.signOut`, refreshes the router cache so the server-rendered nav
 * re-resolves auth (the root layout's `resolveNavAuth` re-runs against the
 * cleared session cookie), and then pushes `/login` via the Next.js router.
 */

const signOut = vi.fn(async () => ({ error: null }));
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  signOut.mockClear();
  push.mockClear();
  refresh.mockClear();
});

describe("useLogout", () => {
  it("returns an async logout function", async () => {
    const { useLogout } = await import("./use-logout");
    const { result } = renderHook(() => useLogout());
    expect(typeof result.current).toBe("function");
  });

  it("calls Supabase auth.signOut, refreshes the router cache, then navigates to /login", async () => {
    const { useLogout } = await import("./use-logout");
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current();
    });

    expect(signOut).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/login");
    // signOut happens before the redirect (mirrors the existing LogoutButton).
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0],
    );
    // refresh happens before the push so the nav re-renders unauthenticated
    // before the /login route mounts.
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0],
    );
  });
});
