"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

/**
 * Header search bar for Creators.
 *
 * A compact form with a search icon and input. On submit (Enter or the
 * implicit submit button), navigates to `/creator/explore?q=<query>` so the
 * explore page can filter server-side. The input is pre-filled with the
 * current `q` param when the user is already on the explore page, so the
 * search bar reflects the active search across navigations.
 *
 * Hidden on the OBS overlay surface (the parent `SiteNav` suppresses itself
 * on `/overlay/*`, so this component is never mounted there).
 */
export function NavSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = React.useState(initialQuery);

  // Sync local state when the URL `q` param changes (e.g. user clears the
  // search from the explore page's "Clear search" link).
  React.useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const target = trimmed
      ? `/creator/explore?q=${encodeURIComponent(trimmed)}`
      : "/creator/explore";
    router.push(target);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Search creators"
      className="relative flex items-center"
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
      />
      <input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search creators"
        aria-label="Search creators"
        className="h-9 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/20 focus:border-primary/40 focus:outline-none focus:ring-[3px] focus:ring-ring/30 md:w-48 lg:w-56"
      />
    </form>
  );
}
