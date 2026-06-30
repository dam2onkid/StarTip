import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignupForm } from "@/components/signup-form";

/**
 * `/signup` — public email + password signup page (shadcn `signup-03` layout).
 *
 * A muted full-height background centers a single `max-w-sm` column: the
 * StarTip logo on top, then the `SignupForm` card. The form itself (client
 * component) handles Supabase `signUp`, password confirmation, the `next`
 * redirect param, and the "check your email" confirmation state.
 */
export default function SignupPage() {
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
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
