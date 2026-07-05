import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { Skeleton } from "@/components/ui/skeleton";

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
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <div className="rounded-lg bg-card p-6 ring-1 ring-foreground/10">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Skeleton className="h-6 w-48 rounded-md" />
                  <Skeleton className="h-4 w-56 rounded-md" />
                </div>
                <div className="mt-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-12 rounded-md" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-16 rounded-md" />
                      <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-24 rounded-md" />
                      <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>
            </div>
          }
        >
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
