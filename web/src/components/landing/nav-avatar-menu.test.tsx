// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * NavAvatarMenu unit tests (PRD: Unified hybrid navigation, issue 03).
 *
 * The avatar menu is the authed right-cluster replacement for the "Become a
 * Creator" CTA. A trigger button shows the caller's avatar (or an initials
 * fallback when `avatarUrl` is null) and opens a dropdown with a
 * display_name + email header, a "Dashboard" link to `/dashboard`, and a
 * "Logout" item that delegates to the shared `useLogout` hook (so the signOut
 * call is not duplicated).
 */

const signOut = vi.fn(async () => ({ error: null }));
const push = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  signOut.mockClear();
  push.mockClear();
});

async function renderMenu(props: {
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
} = {}) {
  const { NavAvatarMenu } = await import("./nav-avatar-menu");
  const utils = render(
    <NavAvatarMenu
      displayName={props.displayName ?? "Fan"}
      email={props.email ?? "fan@example.com"}
      avatarUrl={props.avatarUrl ?? null}
    />,
  );
  return utils;
}

async function openMenu() {
  const trigger = screen.getByRole("button", { name: /account menu/i });
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.pointerUp(trigger);
    fireEvent.click(trigger);
  });
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeInTheDocument(),
  );
}

describe("NavAvatarMenu: trigger", () => {
  it("renders an avatar trigger labelled with the caller's display name", async () => {
    await renderMenu({ displayName: "Fan" });
    expect(
      screen.getByRole("button", { name: /account menu for fan/i }),
    ).toBeInTheDocument();
  });

  it("renders the avatar image when avatarUrl is provided", async () => {
    const { container } = await renderMenu({ avatarUrl: "https://x/a.png" });
    // alt="" makes the avatar a presentation image inside the labelled
    // trigger, so it is not exposed with role="img"; query the element
    // directly.
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe("https://x/a.png");
    expect(img.alt).toBe("");
  });

  it("renders an initials fallback when avatarUrl is null", async () => {
    await renderMenu({ displayName: "Ada Lovelace", avatarUrl: null });
    // Initials fallback for "Ada Lovelace" -> "AL".
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("falls back to a single dot when the display name is blank", async () => {
    await renderMenu({ displayName: "   ", avatarUrl: null });
    expect(screen.getByText("·")).toBeInTheDocument();
  });
});

describe("NavAvatarMenu: dropdown", () => {
  it("opens a menu with a display_name + email header", async () => {
    await renderMenu({ displayName: "Fan", email: "fan@example.com" });
    await openMenu();

    expect(screen.getByText("Fan")).toBeInTheDocument();
    expect(screen.getByText("fan@example.com")).toBeInTheDocument();
  });

  it("Dashboard item links to /dashboard", async () => {
    await renderMenu();
    await openMenu();

    const dash = screen.getByRole("menuitem", { name: /dashboard/i });
    expect(dash).toHaveAttribute("href", "/dashboard");
  });

  it("Logout item calls the shared useLogout handler (signOut + push /login)", async () => {
    await renderMenu();
    await openMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    });

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(push).toHaveBeenCalledWith("/login");
  });
});
