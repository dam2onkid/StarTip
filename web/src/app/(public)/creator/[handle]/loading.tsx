import { BackButton } from "@/components/creator/back-button";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * Route-level loading UI for `/creator/[handle]`. Mirrors the
 * `CreatorPageShell` layout (banner, profile head, stats + support column,
 * leaderboard column) so the transition into the real page is shape-stable
 * and the app feels alive while the server component fetches the profile and
 * donations.
 *
 * Every block is `aria-hidden` (carried by `Skeleton`), so screen readers
 * are not flooded with placeholder nodes.
 */
export default function CreatorLoading() {
  return (
    <section className="relative w-full">
      {/* Banner placeholder — same shape/offset as the real cover. */}
      <div className="absolute inset-x-0 -top-24 -z-10 h-72 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 18% 12%, color-mix(in oklch, var(--foreground) 14%, transparent) 0%, transparent 55%), linear-gradient(180deg, #14171b 0%, #0e1013 100%)",
          }}
        />
      </div>

      {/* Back control. */}
      <div className="mx-auto w-full max-w-4xl px-6 pt-6">
        <BackButton />
      </div>

      {/* Profile head. */}
      <div className="mx-auto w-full max-w-4xl px-6 pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <SkeletonCircle className="h-28 w-28" />
            <div className="flex flex-col gap-1.5 pb-1">
              <Skeleton className="h-8 w-48 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
          {/* Share buttons placeholder. */}
          <div className="flex shrink-0 gap-2">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
          </div>
        </div>
        <SkeletonText
          lines={2}
          className="mt-4 max-w-2xl"
          lineClassName="rounded-md"
        />
      </div>

      {/* Body grid: left column (stats + support), right column (leaderboard). */}
      <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Stats card */}
          <div className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
            <Skeleton className="h-3.5 w-16 rounded-md" />
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              <div className="h-px bg-foreground/10" />
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-5 w-12 rounded-md" />
              </div>
            </div>
          </div>

          {/* Support / Donate CTA card */}
          <div className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
            <Skeleton className="h-3.5 w-20 rounded-md" />
            <SkeletonText lines={2} lineClassName="rounded-md" />
            <Skeleton className="mt-auto h-10 w-full rounded-md" />
          </div>
        </div>

        {/* Leaderboard card */}
        <aside className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
          <Skeleton className="h-3.5 w-24 rounded-md" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md bg-background/40 px-3 py-2 ring-1 ring-foreground/5"
              >
                <span className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-5 rounded-md" />
                  <Skeleton className="h-4 w-28 rounded-md" />
                </span>
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
