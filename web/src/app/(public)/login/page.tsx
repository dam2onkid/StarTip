import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";

/**
 * `/login` — public email + password login page (shadcn `login-03` layout).
 *
 * A muted full-height background centers a single `max-w-sm` column: the
 * StarTip logo on top, then the `LoginForm` card. The form itself (client
 * component) handles Supabase `signInWithPassword`, the `next` redirect param,
 * and the `confirmed=1` email-confirmation hint.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
          aria-label="StarTip home"
        >
          <Image
            src="/logo.png"
            alt="StarTip"
            width={120}
            height={32}
            priority
            className="h-7 w-auto sm:h-8"
          />
        </Link>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
