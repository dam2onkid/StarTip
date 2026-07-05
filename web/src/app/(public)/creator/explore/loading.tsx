import { Badge } from "@/components/ui/badge";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * Route-level loading UI for `/creator/explore`. Mirrors the
 * `ExploreDiscovery` layout (header, search + sort row, creator grid, and the
 * leaderboard sidebar) so navigation into the page is shape-stable while the
 * server component fetches the creator list and donation aggregate.
 */
export default function ExploreLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 pt-28 pb-24">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <Badge variant="outline" className="font-mono text-muted-foreground">
              Discover
            </Badge>
            <Skeleton className="h-9 w-56 rounded-md" />
            <SkeletonText lines={1} className="max-w-xl" lineClassName="rounded-md" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Skeleton className="h-4 w-6 rounded-md" />
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>
        </div>
        {/* Search + sort row */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,420px)_220px]">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="h-px bg-foreground/10" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Creator grid */}
        <main className="flex min-w-0 flex-col gap-4">
          <ul className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <SkeletonCircle className="size-14" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Skeleton className="h-5 w-32 rounded-md" />
                        <Skeleton className="h-3.5 w-24 rounded-md" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <SkeletonText lines={2} lineClassName="rounded-md" />
                  <div className="flex items-center gap-1.5 text-sm">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="size-4 rounded-full" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </main>

        {/* Leaderboard sidebar */}
        <aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-3.5 w-28 rounded-md" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2 ring-1 ring-foreground/5"
              >
                <span className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-5 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
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
