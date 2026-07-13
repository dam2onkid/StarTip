import { Grain } from "@/components/landing/grain";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";

/**
 * Route-level loading UI for `/dashboard`. Mirrors the `DashboardTabs` layout
 * (overview header with identity avatar, display name, status pill, stat
 * strip, tab list, and the active panel body) so the transition from `/login`
 * or a hard refresh into the authed shell is shape-stable while the server
 * component resolves the session, profile, donations, and creator data.
 *
 * The grain layer is rendered so the skeleton matches the real page's
 * atmospheric depth (otherwise the loading frame would look flat against the
 * real page's textured surface).
 */
export default function DashboardLoading() {
  return (
    <>
      <Grain />
      <section className="dashboard relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
        <header className="dashboard-overview">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            {/* Identity */}
            <div className="flex min-w-0 items-center gap-4">
              <SkeletonCircle className="h-14 w-14 sm:h-16 sm:w-16" />
              <div className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-3 w-20 rounded-md" />
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-7 w-40 rounded-md" />
                  <Skeleton className="size-7 rounded-md" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            </div>
            {/* Stat strip */}
            <div className="dashboard-stat-strip">
              <div className="dashboard-stat flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
              <div className="dashboard-stat flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
          </div>

          {/* Tab list row */}
          <div className="mt-6 flex flex-col gap-4 border-t border-foreground/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex">
              <div className="flex gap-1">
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-4 w-64 rounded-md" />
          </div>
        </header>

        {/* Active panel body: a stack of content cards. */}
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="creator-section flex flex-col gap-4 rounded-xl bg-card/60 p-5 ring-1 ring-foreground/8"
            >
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-40 rounded-md" />
                <Skeleton className="h-4 w-24 rounded-md" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-4 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
