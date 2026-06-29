"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * `/login` — public magic link login page. Both Donor and Creator share this
 * single login entry. The visitor enters an email and requests a magic link;
 * Supabase Auth sends a one-time link that resolves at `/auth/callback`, which
 * exchanges the code for a session and redirects.
 *
 * The `next` query param is captured from the URL and forwarded through the
 * `emailRedirectTo` so the callback can return the visitor to their original
 * page. When `next` is absent, the callback defaults to `/dashboard`.
 */
export default function LoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Login</h1>
      <p className="text-muted-foreground">
        Enter your email and we&apos;ll send you a magic sign-in link.
      </p>
      <Suspense fallback={null}>
        <MagicLinkForm />
      </Suspense>
    </section>
  );
}

function MagicLinkForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p
        data-testid="magic-link-sent"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        Check your inbox for the magic link.
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
      <Button type="submit" size="lg" className="w-full">
        Send magic link
      </Button>
      {status === "error" && (
        <p aria-live="polite" className="text-sm text-red-400">
          Something went wrong sending the magic link. Try again.
        </p>
      )}
    </form>
  );
}
