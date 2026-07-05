"use client";

import * as React from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { LogOut } from "lucide-react";
import { useLogout } from "@/hooks/use-logout";

/**
 * Nav avatar menu (PRD: Unified hybrid navigation, issue 03).
 *
 * The authed right-cluster replacement for the "Sign in/up" CTA. A
 * trigger button shows the caller's avatar (or an initials fallback when
 * `avatarUrl` is null) and opens a dropdown with a display_name + email
 * header, a "Dashboard" link to `/dashboard`, and a "Logout" item that
 * delegates to the shared `useLogout` hook so the Supabase `signOut` call is
 * not duplicated.
 */

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function NavAvatarMenu({
  displayName,
  email,
  avatarUrl,
}: {
  displayName: string;
  email: string;
  avatarUrl: string | null;
}) {
  const logout = useLogout();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${displayName}`}
          className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full border border-foreground/10 bg-foreground/[0.03] transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {initialsFrom(displayName)}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[14rem] overflow-hidden rounded-xl border border-foreground/10 bg-background/95 p-1 text-sm shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
        >
          <div className="px-3 py-2.5">
            <div className="text-foreground">{displayName}</div>
            {email ? (
              <div className="truncate font-mono text-xs text-muted-foreground">
                {email}
              </div>
            ) : null}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-foreground/10" />
          <DropdownMenu.Item asChild>
            <Link
              href="/dashboard"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]"
            >
              Dashboard
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={logout}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]"
          >
            <LogOut className="size-3.5 text-muted-foreground" />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
