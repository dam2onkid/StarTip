import { ArrowLeft } from "lucide-react";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";

/**
 * Route-level loading UI for `/creator/[handle]/donate`. Mirrors the
 * `DonatePageShell` + `DonateForm` layout (back control, card with creator
 * identity header, token select, amount, name, message, submit) so the
 * transition into the donate form is shape-stable while the server component
 * resolves the Creator identity.
 */
export default function DonateLoading() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 pt-32 pb-24">
      {/* Back control placeholder, same shape as the real ghost Button. */}
      <div className="flex w-fit items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>

      {/* Donate form card skeleton. */}
      <div className="mx-auto w-full max-w-md rounded-lg bg-card p-6 ring-1 ring-foreground/10">
        {/* Card header: avatar + identity */}
        <div className="flex items-center gap-3">
          <SkeletonCircle className="size-12" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-3.5 w-24 rounded-md" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {/* Wallet row */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-16 rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          {/* Token */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-12 rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-16 rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          {/* Message */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
          {/* Submit */}
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </section>
  )
}
