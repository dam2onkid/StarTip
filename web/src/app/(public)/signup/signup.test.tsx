import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signUp = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signUp } }),
}));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push, refresh }),
}));

// jsdom does not implement window.location.origin writeably in a way that
// affects template literals at call time; stub it so emailRedirectTo is stable.
const ORIGIN = "http://localhost:3000";
vi.stubGlobal("location", { ...window.location, origin: ORIGIN });

function setNext(value: string | null) {
  searchParams.delete("next");
  if (value !== null) searchParams.set("next", value);
}

async function submitSignup(email: string, password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
}

describe("/signup email + password form", () => {
  beforeEach(() => {
    signUp.mockReset();
    push.mockReset();
    refresh.mockReset();
    setNext(null);
  });

  it("renders an email, password, confirm password, and a Sign up action", async () => {
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("calls signUp with email, password, and emailRedirectTo to /login?confirmed=1", async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "secret123");

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const arg = signUp.mock.calls[0][0] as {
      email: string;
      password: string;
      options: { emailRedirectTo: string };
    };
    expect(arg.email).toBe("fan@example.com");
    expect(arg.password).toBe("secret123");
    expect(arg.options.emailRedirectTo).toBe(
      `${ORIGIN}/login?confirmed=1`,
    );
  });

  it("shows the check-email confirmation message when no session is returned", async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "secret123");

    await waitFor(() =>
      expect(screen.getByTestId("signup-confirmation-sent")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to next when a session is returned immediately", async () => {
    setNext("/creator/explore");
    signUp.mockResolvedValue({
      data: { user: {}, session: { access_token: "x" } },
      error: null,
    });
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "secret123");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/creator/explore"));
  });

  it("navigates to /dashboard by default when a session is returned", async () => {
    signUp.mockResolvedValue({
      data: { user: {}, session: { access_token: "x" } },
      error: null,
    });
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "secret123");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error when passwords do not match", async () => {
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "different");

    await waitFor(() =>
      expect(screen.getByTestId("signup-error")).toHaveTextContent(
        /passwords do not match/i,
      ),
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the error message when signUp fails", async () => {
    signUp.mockResolvedValue({
      data: {},
      error: { message: "User already registered" },
    });
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);

    await submitSignup("fan@example.com", "secret123", "secret123");

    await waitFor(() =>
      expect(screen.getByTestId("signup-error")).toHaveTextContent(
        "User already registered",
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("renders a link to /login forwarding next when present", async () => {
    setNext("/creator/explore");
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link).toHaveAttribute("href", "/login?next=%2Fcreator%2Fexplore");
  });

  it("renders a link to /login with no query when next is the default", async () => {
    const { default: SignupPage } = await import("@/app/(public)/signup/page");
    render(<SignupPage />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});
