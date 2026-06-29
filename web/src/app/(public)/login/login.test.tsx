import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInWithOtp = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signInWithOtp } }),
}));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function setNext(value: string | null) {
  searchParams.delete("next");
  if (value !== null) searchParams.set("next", value);
}

async function submitEmail(email: string) {
  const input = screen.getByLabelText(/email/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
}

describe("/login magic link form", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    setNext(null);
  });

  it("renders an email input and a Send magic link action", async () => {
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send magic link/i }),
    ).toBeInTheDocument();
  });

  it("calls signInWithOtp with the email and emailRedirectTo carrying next when submitted", async () => {
    setNext("/creator/explore");
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitEmail("fan@example.com");

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    const arg = signInWithOtp.mock.calls[0][0] as {
      email: string;
      options: { emailRedirectTo: string };
    };
    expect(arg.email).toBe("fan@example.com");
    const redirect = arg.options.emailRedirectTo;
    expect(redirect).toContain("/auth/callback");
    expect(redirect).toContain("next=%2Fcreator%2Fexplore");
  });

  it("forwards next=/dashboard by default when no next param is present", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitEmail("fan@example.com");

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled());
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(arg.options.emailRedirectTo).toContain("next=%2Fdashboard");
  });

  it("shows a confirmation message after the magic link is sent", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { default: LoginPage } = await import("@/app/(public)/login/page");
    render(<LoginPage />);

    await submitEmail("fan@example.com");

    await waitFor(() =>
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
    );
  });
});
