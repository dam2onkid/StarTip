"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusLine, humanError } from "../utils";
import type { CreatorProfile, Status } from "../types";

/** Gate 1: claim a Handle. */
export function ProfilePendingGate(args: {
  current: CreatorProfile;
  status: Status;
  setStatus: (s: Status) => void;
  onClaimed: (p: Partial<CreatorProfile>) => void;
}) {
  const { status, setStatus, onClaimed } = args;
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<
    | { state: "unknown" }
    | { state: "available" }
    | { state: "taken"; reason: string }
  >({ state: "unknown" });

  // Debounced availability check: query the server (which checks both the
  // profiles table and on-chain get_creator) as the user types a valid handle.
  useEffect(() => {
    if (handle.trim().length < 3) return;
    const id = window.setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/creators", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle, dryRun: true }),
        });
        if (res.status === 200) {
          setAvailability({ state: "available" });
        } else if (res.status === 409) {
          const body = (await res.json()) as { reason?: string };
          setAvailability({ state: "taken", reason: body.reason ?? "taken" });
        } else {
          setAvailability({ state: "unknown" });
        }
      } catch {
        setAvailability({ state: "unknown" });
      } finally {
        setChecking(false);
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [handle]);

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Become a Creator</CardTitle>
          <CardDescription>
            Claim a Handle to start receiving tips on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setOpen(true)}>
            Become a Creator
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function submit() {
    setStatus({ kind: "busy" });
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { handle: string };
        onClaimed({ handle: body.handle });
        setStatus({ kind: "idle" });
      } else {
        const body = (await res.json()) as { error: string; reason?: string };
        setStatus({
          kind: "error",
          message:
            body.reason === "onchain_taken"
              ? "That handle is already registered on-chain."
              : body.error === "handle_taken"
                ? "That handle is taken."
                : humanError(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not claim handle. Try again." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim your Handle</CardTitle>
        <CardDescription>
          3-32 characters: lowercase letters, numbers, hyphens, underscores.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="handle-input">
            Handle
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="handle-input"
              name="handle"
              className="flex-1"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setAvailability({ state: "unknown" });
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="ada-lovelace"
              aria-describedby="handle-status"
            />
            <Button
              type="button"
              size="sm"
              onClick={submit}
              loading={status.kind === "busy"}
              disabled={status.kind === "busy" || availability.state === "taken" || handle.trim().length < 3}
            >
              Claim
            </Button>
          </div>
          <AvailabilityPill
            id="handle-status"
            checking={checking}
            availability={availability}
          />
        </div>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

export function AvailabilityPill(args: {
  id: string;
  checking: boolean;
  availability:
    | { state: "unknown" }
    | { state: "available" }
    | { state: "taken"; reason: string };
}) {
  const { id, checking, availability } = args;
  if (checking) return <p id={id} className="text-xs text-muted-foreground">Checking availability…</p>;
  if (availability.state === "available")
    return <p id={id} className="text-xs text-primary">Handle is available.</p>;
  if (availability.state === "taken")
    return <p id={id} className="text-xs text-destructive">Handle is taken.</p>;
  return null;
}
