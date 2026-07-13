import { Suspense } from "react";
import { AuthShell } from "@/components/landing/auth-shell";
import { SignupForm } from "@/components/signup-form";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/signup` — public email + password signup page (Databuddy-inspired auth shell).
 *
 * A two-panel auth surface: the left panel carries the StarTip brand atmosphere,
 * and the right panel centers the `SignupForm`. The form itself (client
 * component) handles Supabase `signUp`, password confirmation, the `next`
 * redirect param, and the "check your email" confirmation state.
 */
export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div className="space-y-1.5 px-6">
              <Skeleton className="h-7 w-48 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-md" />
            </div>
            <div className="flex flex-col gap-4 px-6">
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
        }
      >
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
