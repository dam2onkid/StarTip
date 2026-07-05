import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

/**
 * `SkeletonCircle` — circular placeholder for avatars. Defaults to a 56px
 * circle; override with a size utility (`size-14`, `size-28`, ...).
 */
function SkeletonCircle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Skeleton
      aria-hidden
      className={cn("size-14 rounded-full", className)}
      {...props}
    />
  )
}

/**
 * `SkeletonText` — a stack of lines mimicking a paragraph or label stack.
 * The final line is shorter to look like natural prose. `lines` controls the
 * count; pass `className` for the column width and `lineClassName` for the
 * per-line height.
 */
function SkeletonText({
  lines = 3,
  className,
  lineClassName,
  ...props
}: React.ComponentProps<"div"> & {
  lines?: number
  lineClassName?: string
}) {
  return (
    <div
      aria-hidden
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            i === lines - 1 ? "w-2/3" : "w-full",
            lineClassName,
          )}
        />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCircle, SkeletonText }
