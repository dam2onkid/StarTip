import { Suspense } from "react";
import { AuthShell } from "@/components/landing/auth-shell";
import { LoginForm } from "@/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/login` — public email + password login page (Databuddy-inspired auth shell).
 *
 * A two-panel auth surface: the left panel carries the StarTip brand atmosphere,
 * and the right panel centers the `LoginForm`. The form itself (client
 * component) handles Supabase `signInWithPassword`, the `next` redirect param,
 * and the `confirmed=1` email-confirmation hint.
 */
export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div className="space-y-1.5 px-6">
              <Skeleton className="h-7 w-40 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-md" />
            </div>
            <div className="flex flex-col gap-4 px-6">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-12 rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-16 rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
