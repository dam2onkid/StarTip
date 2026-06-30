"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * `/signup` — public email + password signup page. The visitor enters an email,
 * a password, and a password confirmation, then signs up via Supabase Auth
 * `signUp`. Because `enable_confirmations = true`, Supabase sends a
 * confirmation email and returns no session; the page shows a "check your
 * email" message. The confirmation email redirects back to `/login?confirmed=1`
 * so the visitor lands on the login page ready to sign in.
 *
 * When Supabase returns a session immediately (e.g. the E2E mock auto-confirms,
 * or confirmation is disabled), the router navigates straight to `next`
 * (defaulting to `/dashboard`).
 */
export default function SignupPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="text-muted-foreground">
        Enter your email and choose a password to sign up.
      </p>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </section>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const supabase = createBrowserClient();
    const emailRedirectTo = `${window.location.origin}/login?confirmed=1`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) {
      setError(error.message);
      return;
    }
    // When email confirmation is enabled, Supabase returns a user but no
    // session. When confirmation is off (or the E2E mock auto-confirms), a
    // session is returned and we can navigate straight in.
    if (data.session) {
      router.push(next);
      router.refresh();
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p
        data-testid="signup-confirmation-sent"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        Check your inbox for the confirmation link to activate your account.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm text-muted-foreground">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-border/40 bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <label htmlFor="password" className="text-sm text-muted-foreground">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-border/40 bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <label htmlFor="confirm-password" className="text-sm text-muted-foreground">
        Confirm password
      </label>
      <input
        id="confirm-password"
        name="confirm-password"
        type="password"
        required
        autoComplete="new-password"
        minLength={6}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="rounded-md border border-border/40 bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="lg" className="w-full">
        Sign up
      </Button>
      {error && (
        <p
          aria-live="polite"
          data-testid="signup-error"
          className="text-sm text-red-400"
        >
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-foreground underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
