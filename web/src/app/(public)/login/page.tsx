"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * `/login` — public email + password login page. Both Donor and Creator share
 * this single login entry. The visitor enters an email and password and signs
 * in via Supabase Auth `signInWithPassword`; on success the router navigates to
 * the `next` query param (defaulting to `/dashboard`).
 *
 * The `next` query param is captured from the URL so a deep link to a gated
 * route can bounce through `/login` and return the visitor to their original
 * page after authentication. A `confirmed=1` param (set by the email
 * confirmation redirect) surfaces a "your email is confirmed" hint.
 */
export default function LoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Login</h1>
      <p className="text-muted-foreground">
        Enter your email and password to sign in.
      </p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </section>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const confirmed = searchParams.get("confirmed") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {confirmed && (
        <p
          data-testid="email-confirmed-hint"
          aria-live="polite"
          className="text-sm text-foreground/80"
        >
          Your email is confirmed. You can sign in now.
        </p>
      )}
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
        autoComplete="current-password"
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-border/40 bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="lg" className="w-full">
        Sign in
      </Button>
      {error && (
        <p
          aria-live="polite"
          data-testid="login-error"
          className="text-sm text-red-400"
        >
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-foreground underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
