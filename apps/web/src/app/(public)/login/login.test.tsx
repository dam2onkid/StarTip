import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInWithPassword = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signInWithPassword } }),
}));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push, refresh }),
}));

function setNext(value: string | null) {
  searchParams.delete("next");
  if (value !== null) searchParams.set("next", value);
}

function setConfirmed(value: boolean) {
  if (value) searchParams.set("confirmed", "1");
  else searchParams.delete("confirmed");
}

async function submitCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("/login email + password form", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    push.mockReset();
    refresh.mockReset();
    setNext(null);
    setConfirmed(false);
  });

  it("renders an email input, a password input, and a Sign in action", async () => {
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls signInWithPassword with the email and password when submitted", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitCredentials("fan@example.com", "secret123");

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "fan@example.com",
      password: "secret123",
    });
  });

  it("navigates to next when sign in succeeds", async () => {
    setNext("/creator/explore");
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitCredentials("fan@example.com", "secret123");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/creator/explore"));
  });

  it("navigates to /dashboard by default when no next param is present", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitCredentials("fan@example.com", "secret123");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the error message when sign in fails", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitCredentials("fan@example.com", "wrongpass");

    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(
        "Invalid login credentials",
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("renders a link to /signup forwarding next when present", async () => {
    setNext("/creator/explore");
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link).toHaveAttribute("href", "/signup?next=%2Fcreator%2Fexplore");
  });

  it("renders a link to /signup with no query when next is the default", async () => {
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("shows the email-confirmed hint when confirmed=1 is present", async () => {
    setConfirmed(true);
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);
    expect(screen.getByTestId("email-confirmed-hint")).toBeInTheDocument();
  });
});
