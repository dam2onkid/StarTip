"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * `SignupForm` — email + password signup form for the Databuddy-inspired auth
 * shell.
 *
 * The visitor enters an email, a password, and a password confirmation, then
 * signs up via Supabase Auth `signUp`. Because `enable_confirmations = true`,
 * Supabase sends a confirmation email and returns no session; the form shows a
 * "check your email" message. The confirmation email redirects back to
 * `/login?confirmed=1` so the visitor lands on the login page ready to sign in.
 *
 * When Supabase returns a session immediately (e.g. the E2E mock auto-confirms,
 * or confirmation is disabled), the router navigates straight to `next`
 * (defaulting to `/dashboard`).
 */
export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createBrowserClient();
    const emailRedirectTo = `${window.location.origin}/login?confirmed=1`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
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
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <div className="space-y-1.5 px-6">
          <h1 className="text-balance font-display text-2xl text-foreground">
            Check your inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to activate your account.
          </p>
        </div>
        <div className="px-6">
          <p
            data-testid="signup-confirmation-sent"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Check your inbox for the confirmation link to activate your
            account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="space-y-1.5 px-6">
        <h1 className="text-balance font-display text-2xl text-foreground">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email below to create your account
        </p>
      </div>
      <div className="px-6">
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
                required
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <Field className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <PasswordInput
                    id="password"
                    name="password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm Password
                  </FieldLabel>
                  <PasswordInput
                    id="confirm-password"
                    name="confirm-password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              </Field>
              <FieldDescription>
                Must be at least 6 characters long.
              </FieldDescription>
            </Field>
            <Field>
              <Button type="submit" size="lg" loading={loading} className="w-full">
                Sign up
              </Button>

              <FieldDescription className="text-center">
                Already have an account?{" "}
                <Link
                  href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Log in
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </div>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
}
