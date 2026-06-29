"use client";

import { useState, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The Donor tab of `/dashboard`: a logged-in User sees their donation
 * history, their rank on the Global Leaderboard and on each Creator's
 * leaderboard, and can edit their `display_name` + `avatar_url` (including
 * uploading an avatar to Supabase Storage).
 *
 * The server component passes the initial snapshot (profile, history, ranks);
 * this client component owns the profile edit + avatar upload flow. Profile
 * updates go through the browser Supabase client so the owner UPDATE RLS path
 * (`auth.uid() = profiles.user_id`) and the storage owner-write RLS path
 * (`avatars/<user_id>/...`) apply directly from the browser.
 */

export interface DonorProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface DonorDonation {
  id: string;
  token: string;
  amount: string;
  message: string | null;
  donor_name: string;
  status: string;
  created_at: string;
  creator_profile_id: string;
}

export interface DonorPerCreatorRank {
  creator_profile_id: string;
  handle: string;
  display_name: string;
  rank: number | null;
  total: string;
}

export interface DonorTabProps {
  profile: DonorProfile;
  donations: DonorDonation[];
  globalRank: { rank: number | null; total: string };
  perCreatorRanks: DonorPerCreatorRank[];
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function DonorTab({
  profile,
  donations,
  globalRank,
  perCreatorRanks,
}: DonorTabProps) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      let nextAvatarUrl = avatarUrl;

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${profile.user_id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("avatars").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;
        nextAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const update: { display_name: string; avatar_url?: string | null } = {
        display_name: displayName.trim() || "Anonymous",
      };
      if (nextAvatarUrl !== profile.avatar_url) {
        update.avatar_url = nextAvatarUrl;
      }

      const res = await supabase
        .from("profiles")
        .update(update)
        .eq("user_id", profile.user_id);
      if (res.error) throw res.error;

      setAvatarUrl(nextAvatarUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus({ kind: "saved" });
    } catch (e) {
      let message = "Could not save profile.";
      if (e instanceof Error && e.message) {
        message = e.message;
      } else if (
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof (e as { message: unknown }).message === "string"
      ) {
        message = (e as { message: string }).message;
      }
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Donation history */}
      <Card>
        <CardHeader>
          <CardTitle>Donation history</CardTitle>
          <CardDescription>Your past donations, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {donations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not donated yet. Browse creators and tip to appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="donor-history">
              {donations.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 ring-1 ring-foreground/10"
                >
                  <span className="flex flex-col">
                    <span className="font-mono text-sm text-foreground">
                      {d.amount} {d.token}
                    </span>
                    {d.message && (
                      <span className="text-xs text-muted-foreground">{d.message}</span>
                    )}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-muted-foreground">{d.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Global rank */}
      <Card>
        <CardHeader>
          <CardTitle>Global Leaderboard rank</CardTitle>
          <CardDescription>
            Your standing across all creators. Anonymous donations are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {globalRank.rank === null ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Log in to donate and climb the board.
            </p>
          ) : (
            <p className="text-sm" data-testid="global-rank">
              <span className="font-mono text-foreground">#{globalRank.rank}</span>{" "}
              <span className="text-muted-foreground">
                with {globalRank.total} donated.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-creator ranks */}
      <Card>
        <CardHeader>
          <CardTitle>Per-creator ranks</CardTitle>
          <CardDescription>
            Your standing with each creator you have donated to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perCreatorRanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Donate to a creator to see your rank with them.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="per-creator-ranks">
              {perCreatorRanks.map((r) => (
                <li
                  key={r.creator_profile_id}
                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 ring-1 ring-foreground/10"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{r.display_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">@{r.handle}</span>
                  </span>
                  {r.rank === null ? (
                    <span className="text-xs text-muted-foreground">No tracked donations</span>
                  ) : (
                    <span className="font-mono text-sm text-foreground">#{r.rank}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle>Edit your donor identity</CardTitle>
          <CardDescription>
            Your display name appears on donations and leaderboards. Your avatar
            is shown next to your name.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
                data-testid="avatar-preview"
              />
            ) : (
              <div
                aria-hidden
                className="h-12 w-12 rounded-full bg-foreground/10"
                data-testid="avatar-placeholder"
              />
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="avatar-input">
                Avatar
              </label>
              <input
                id="avatar-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="text-xs text-muted-foreground"
                data-testid="avatar-input"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="display-name-input">
              Display name
            </label>
            <input
              id="display-name-input"
              className="h-9 flex-1 rounded-lg border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setStatus({ kind: "idle" });
              }}
              placeholder="Anonymous"
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={status.kind === "saving"}
            className="self-start"
          >
            {status.kind === "saving" ? "Saving…" : "Save profile"}
          </Button>
          {status.kind === "saved" && (
            <p className="text-xs text-tertiary" aria-live="polite" data-testid="save-status">
              Profile saved.
            </p>
          )}
          {status.kind === "error" && (
            <p className="text-xs text-destructive" aria-live="polite" role="alert" data-testid="save-status">
              {status.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
