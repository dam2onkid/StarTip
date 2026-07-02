"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  ArrowUpDownIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

export interface ExploreDiscoveryCreator {
  handle: string
  display_name: string
  avatar_url: string | null
  bio?: string | null
}

export interface ExploreDiscoveryLeaderboardEntry {
  donor_name: string
  total_amount: string
}

type CreatorSort = "name-asc" | "name-desc" | "handle-asc" | "handle-desc"

const SORT_LABELS: Record<CreatorSort, string> = {
  "name-asc": "Name A-Z",
  "name-desc": "Name Z-A",
  "handle-asc": "Handle A-Z",
  "handle-desc": "Handle Z-A",
}

const collator = new Intl.Collator("en", { sensitivity: "base" })

export function ExploreDiscovery({
  creators,
  leaderboard,
  creatorsError = false,
  leaderboardError = false,
  searchQuery = "",
}: {
  creators: ExploreDiscoveryCreator[]
  leaderboard: ExploreDiscoveryLeaderboardEntry[]
  creatorsError?: boolean
  leaderboardError?: boolean
  searchQuery?: string
}) {
  const [query, setQuery] = useState(searchQuery)
  const [sort, setSort] = useState<CreatorSort>("name-asc")

  const visibleCreators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filteredCreators = normalizedQuery
      ? creators.filter((creator) =>
          [creator.display_name, creator.handle, creator.bio ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : creators

    return [...filteredCreators].sort((a, b) => {
      const [field, direction] = sort.split("-") as ["name" | "handle", "asc" | "desc"]
      const left = field === "name" ? a.display_name : a.handle
      const right = field === "name" ? b.display_name : b.handle
      const result = collator.compare(left, right)

      return direction === "asc" ? result : -result
    })
  }, [creators, query, sort])

  const trimmedQuery = query.trim()

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 pt-28 pb-24">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <Badge variant="outline" className="font-mono text-muted-foreground">
              Discover
            </Badge>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Explore Creators
            </h1>
            <p className="text-muted-foreground">
              Find active Creators, scan public profiles, and compare the global donor board.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{visibleCreators.length}</span>
            <span>{trimmedQuery ? "matching" : "active"} Creators</span>
          </div>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-[minmax(0,420px)_220px]">
          <Field>
            <FieldLabel htmlFor="creator-search" className="sr-only">
              Search creators
            </FieldLabel>
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="creator-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search creators"
                className="pl-9"
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="creator-sort" className="sr-only">
              Sort creators
            </FieldLabel>
            <Select value={sort} onValueChange={(value) => setSort(value as CreatorSort)}>
              <SelectTrigger id="creator-sort" aria-label="Sort creators">
                <ArrowUpDownIcon data-icon="inline-start" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <Separator />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-w-0 flex-col gap-4">
          {creatorsError ? (
            <Card>
              <CardHeader>
                <CardTitle>Creators unavailable</CardTitle>
                <CardDescription>Could not load Creators right now.</CardDescription>
              </CardHeader>
            </Card>
          ) : creators.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {trimmedQuery ? "No matching Creators" : "No Creators yet"}
                </CardTitle>
                <CardDescription>
                  {trimmedQuery
                    ? `No Creators match "${trimmedQuery}". Try a different search.`
                    : "No Creators have registered yet. Check back soon."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : visibleCreators.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No matching Creators</CardTitle>
                <CardDescription>
                  No Creators match &quot;{trimmedQuery}&quot;. Try a different search.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" data-testid="creator-list">
              {visibleCreators.map((creator) => (
                <li key={creator.handle}>
                  <Card className="group relative h-full gap-5 overflow-hidden py-5 transition hover:border-primary/35">
                    <CardHeader className="px-5">
                      <div className="flex min-w-0 items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                          <Avatar className="size-14 border border-border">
                            {creator.avatar_url ? (
                              <AvatarImage src={creator.avatar_url} alt="" />
                            ) : null}
                            <AvatarFallback>{getInitials(creator.display_name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <CardTitle className="truncate text-base leading-5 md:text-lg">
                              <Link
                                href={`/creator/${creator.handle}`}
                                className="after:absolute after:inset-0"
                              >
                                {creator.display_name}
                              </Link>
                            </CardTitle>
                            <CardDescription className="font-mono text-xs">
                              @{creator.handle}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="gap-1 text-muted-foreground">
                          <SparklesIcon aria-hidden />
                          Active
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col justify-between gap-5 px-5">
                      <p className="line-clamp-2 min-h-11 text-sm text-muted-foreground">
                        {creator.bio
                          ? creator.bio
                          : "Public Creator profile ready for donations."}
                      </p>
                      <div className="flex items-center justify-end border-t border-border pt-4 text-sm">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          View
                          <ArrowRightIcon
                            aria-hidden
                            className="size-4 transition-transform group-hover:translate-x-0.5"
                          />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="sticky top-28 gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle>Global Leaderboard</CardTitle>
              <CardDescription>Logged-in donors ranked by total confirmed donations.</CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              {leaderboardError ? (
                <p className="text-sm text-muted-foreground">
                  Could not load the leaderboard right now.
                </p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tracked donations yet. Log in to donate and climb the board.
                </p>
              ) : (
                <ol className="flex flex-col gap-2" data-testid="global-leaderboard">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.donor_name}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background/30 px-3 py-2"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {entry.donor_name}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {entry.total_amount}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  )
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}
