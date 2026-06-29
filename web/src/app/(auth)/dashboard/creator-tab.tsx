"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deriveOnboardingState,
  type OnboardingProfile,
  type OnboardingState,
} from "@/lib/onboarding/state";
import {
  connectWallet,
  getWalletAddress,
  signWalletMessage,
  classifySignMessageError,
} from "@/lib/wallet/kit";
import {
  registerCreatorOnChain,
  readTreasuryAddress,
  payoutAddressWarning,
} from "@/lib/onboarding/register";
import { contractId } from "@/lib/stellar/client";

/**
 * The Creator tab of `/dashboard`: the four-gate onboarding state machine
 * (CONTEXT.md §Onboarding State) rendered inline. Each gate blocks the next,
 * and the state is a pure derivation from the Profile's Creator fields.
 *
 * The server component passes the initial Profile snapshot; this client
 * component owns the optimistic updates as each gate clears and subscribes to
 * Supabase Realtime on the Profile row so the `onchain_pending → active` flip
 * happens the moment the indexer mirrors `CreatorRegistered`, with no manual
 * refresh.
 */

export interface CreatorProfile extends OnboardingProfile {
  id: string;
  /** On-chain payout address; set by the indexer after `CreatorRegistered`. */
  payout_address?: string | null;
}

export interface CreatorTabProps {
  profile: CreatorProfile;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

export function CreatorTab({ profile }: CreatorTabProps) {
  const [current, setCurrent] = useState<CreatorProfile>(profile);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const state = deriveOnboardingState(current);
  // Realtime only needs to attach once the wallet is linked and we are waiting
  // on the indexer. Re-attach when the profile id or gate changes.
  useOnchainRegisteredRealtime(current, (next) => {
    setCurrent((prev) => ({ ...prev, onchain_registered: true, ...next }));
    setStatus({ kind: "info", message: "You are live on-chain. Creator is active." });
  });

  return (
    <div className="flex flex-col gap-4">
      <GateStepper state={state} />
      {state === "profile_pending" && (
        <ProfilePendingGate
          current={current}
          status={status}
          setStatus={setStatus}
          onClaimed={(p) => setCurrent((prev) => ({ ...prev, ...p }))}
        />
      )}
      {state === "wallet_pending" && (
        <WalletPendingGate
          current={current}
          status={status}
          setStatus={setStatus}
          onLinked={(ownerAddress) =>
            setCurrent((prev) => ({ ...prev, owner_address: ownerAddress }))
          }
        />
      )}
      {state === "onchain_pending" && (
        <OnchainPendingGate
          current={current}
          status={status}
          setStatus={setStatus}
          onSubmitted={() =>
            setStatus({
              kind: "info",
              message: "Registration submitted. Waiting for the indexer to mirror it.",
            })
          }
        />
      )}
      {state === "active" && <ActiveGate current={current} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The four-gate progress indicator. The active gate and those before it are
 * lit; the rest are dim. */
function GateStepper({ state }: { state: OnboardingState }) {
  const order: OnboardingState[] = [
    "profile_pending",
    "wallet_pending",
    "onchain_pending",
    "active",
  ];
  const labels: Record<OnboardingState, string> = {
    profile_pending: "Handle",
    wallet_pending: "Wallet",
    onchain_pending: "On-chain",
    active: "Active",
  };
  const activeIdx = order.indexOf(state);
  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground">
      {order.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[0.65rem] " +
                (active
                  ? "border-tertiary text-tertiary"
                  : done
                    ? "border-foreground/40 text-foreground"
                    : "border-border/50 text-muted-foreground/60")
              }
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "text-foreground" : ""}>{labels[s]}</span>
            {i < order.length - 1 && (
              <span aria-hidden className="h-px w-6 bg-border/40" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

/** Gate 1: claim a Handle. */
function ProfilePendingGate(args: {
  current: CreatorProfile;
  status: Status;
  setStatus: (s: Status) => void;
  onClaimed: (p: Partial<CreatorProfile>) => void;
}) {
  const { current, status, setStatus, onClaimed } = args;
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
    setAvailability({ state: "unknown" });
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
          message: body.reason === "onchain_taken"
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
            <input
              id="handle-input"
              className="h-9 flex-1 rounded-lg border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="ada-lovelace"
              aria-describedby="handle-status"
            />
            <Button
              type="button"
              size="sm"
              onClick={submit}
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

function AvailabilityPill(args: {
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
    return <p id={id} className="text-xs text-tertiary">Handle is available.</p>;
  if (availability.state === "taken")
    return <p id={id} className="text-xs text-destructive">Handle is taken.</p>;
  return null;
}

/* ------------------------------------------------------------------ */

/** Gate 2: link a wallet via signMessage. */
function WalletPendingGate(args: {
  current: CreatorProfile;
  status: Status;
  setStatus: (s: Status) => void;
  onLinked: (ownerAddress: string) => void;
}) {
  const { current, status, setStatus, onLinked } = args;
  const [address, setAddress] = useState<string | null>(null);

  async function connect() {
    setStatus({ kind: "busy" });
    try {
      await connectWallet();
      const addr = await getWalletAddress();
      setAddress(addr);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Could not connect wallet.") });
    }
  }

  async function link() {
    if (!address) return;
    setStatus({ kind: "busy" });
    try {
      const ch = await fetch("/api/wallet/link/challenge", { method: "POST" });
      if (ch.status !== 200) {
        const body = (await ch.json()) as { error: string };
        setStatus({ kind: "error", message: humanError(body.error) });
        return;
      }
      const { challenge } = (await ch.json()) as { challenge: string };
      const signed = await signWalletMessage(challenge);
      const res = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          signedMessage: signed.signedMessage,
          signerAddress: signed.signerAddress ?? address,
        }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { owner_address: string };
        onLinked(body.owner_address);
        setStatus({ kind: "idle" });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({ kind: "error", message: humanError(body.error) });
      }
    } catch (e) {
      if (classifySignMessageError(e) === "unsupported") {
        setStatus({
          kind: "error",
          message:
            "This wallet cannot sign messages. Reconnect with a message-signing wallet like Freighter.",
        });
        return;
      }
      setStatus({ kind: "error", message: errorMessage(e, "Could not link wallet.") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link your Stellar wallet</CardTitle>
        <CardDescription>
          Handle <span className="text-foreground">@{current.handle}</span> is reserved.
          Sign a challenge with your wallet to bind it as your on-chain identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {address ? (
          <p className="text-xs text-muted-foreground">
            Connected: <span className="font-mono text-foreground">{address}</span>
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={connect} disabled={status.kind === "busy"}>
            {address ? "Reconnect wallet" : "Connect wallet"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={link}
            disabled={!address || status.kind === "busy"}
          >
            Sign challenge & link
          </Button>
        </div>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Gate 3: register on-chain. */
function OnchainPendingGate(args: {
  current: CreatorProfile;
  status: Status;
  setStatus: (s: Status) => void;
  onSubmitted: () => void;
}) {
  const { current, status, setStatus, onSubmitted } = args;
  const [payout, setPayout] = useState("");
  const [treasury, setTreasury] = useState<string | null | undefined>(undefined);
  const submittedRef = useRef(false);

  // Load the on-chain Treasury once, for the stranded-funds warning (ADR-0004).
  useEffect(() => {
    let alive = true;
    readTreasuryAddress()
      .then((t) => {
        if (alive) setTreasury(t);
      })
      .catch(() => {
        if (alive) setTreasury(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const warning = useMemo(
    () =>
      treasury === undefined
        ? null
        : payoutAddressWarning(payout.trim(), { contractId, treasuryAddress: treasury }),
    [payout, treasury],
  );

  async function register() {
    if (!current.owner_address || !current.handle) return;
    setStatus({ kind: "busy" });
    try {
      await registerCreatorOnChain({
        ownerAddress: current.owner_address,
        handle: current.handle,
        payoutAddress: payout.trim(),
      });
      submittedRef.current = true;
      onSubmitted();
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "On-chain registration failed.") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register on-chain</CardTitle>
        <CardDescription>
          Set a Payout Address and sign <span className="font-mono">register_creator</span> with
          your wallet. The indexer will flip you to active once it mirrors the event.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Wallet: <span className="font-mono text-foreground">{current.owner_address}</span>
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="payout-input">
            Payout Address
          </label>
          <input
            id="payout-input"
            className="h-9 flex-1 rounded-lg border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={payout}
            onChange={(e) => setPayout(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="G…"
            aria-describedby="payout-warning"
          />
        </div>
        {warning ? (
          <p id="payout-warning" className="text-xs text-destructive">
            Warning: this is the {warning === "contract" ? "contract address" : "Treasury address"}.
            The contract will not reject it and funds sent there will be stranded.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={register}
          disabled={status.kind === "busy" || payout.trim().length === 0}
          className="self-start"
        >
          {status.kind === "info" ? "Registration pending" : "Register on-chain"}
        </Button>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Gate 4: active. */
function ActiveGate({ current }: { current: CreatorProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Creator is active</CardTitle>
        <CardDescription>
          You are registered on-chain and can receive donations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>Handle: <span className="font-mono text-foreground">@{current.handle}</span></p>
        <p>Wallet: <span className="font-mono text-foreground">{current.owner_address}</span></p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Subscribe to Supabase Realtime on the caller's profile row and invoke the
 * callback when `onchain_registered` flips to true. The subscription is scoped
 * to the profile id and cleaned up on unmount / profile change.
 *
 * Test seam: when `window.__STARTIP_REALTIME_STUB__` is present (injected by
 * the Playwright E2E harness), the hook registers the callback with the stub
 * instead of opening a Realtime channel. This lets E2E drive the
 * `onchain_pending → active` flip deterministically without a WebSocket.
 */
export interface RealtimeStub {
  subscribe(onActive: (next: Partial<CreatorProfile>) => void): () => void;
}

declare global {
  interface Window {
    __STARTIP_REALTIME_STUB__?: RealtimeStub;
  }
}

function useOnchainRegisteredRealtime(
  profile: CreatorProfile,
  onActive: (next: Partial<CreatorProfile>) => void,
) {
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  useEffect(() => {
    if (profile.onchain_registered) return; // already active, no need to listen

    const stub =
      typeof window !== "undefined" ? window.__STARTIP_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((next) => onActiveRef.current(next));
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`profiles:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const next = payload.new as {
            onchain_registered?: boolean;
            payout_address?: string | null;
          };
          if (next.onchain_registered) {
            onActiveRef.current({
              payout_address: next.payout_address ?? undefined,
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.onchain_registered]);
}

/* ------------------------------------------------------------------ */

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "busy") {
    return status.kind === "busy" ? (
      <p className="text-xs text-muted-foreground" aria-live="polite">Working…</p>
    ) : null;
  }
  if (status.kind === "info") {
    return <p className="text-xs text-tertiary" aria-live="polite">{status.message}</p>;
  }
  return <p className="text-xs text-destructive" aria-live="polite" role="alert">{status.message}</p>;
}

function humanError(code: string): string {
  switch (code) {
    case "invalid_handle":
      return "Handle must be 3-32 lowercase letters, numbers, hyphens, or underscores.";
    case "already_registered":
      return "You are already a registered Creator.";
    case "handle_taken":
      return "That handle is taken.";
    case "no_handle":
      return "Claim a handle first.";
    case "already_linked":
      return "A wallet is already linked and registered on-chain.";
    case "signer_mismatch":
      return "The signing wallet does not match the address you provided.";
    case "nonce_missing":
    case "nonce_expired":
      return "The link challenge expired. Request a new one.";
    case "invalid_signature":
      return "Signature verification failed.";
    case "invalid_address":
      return "That does not look like a valid Stellar address.";
    case "unauthorized":
      return "Your session expired. Please log in again.";
    case "profile_not_found":
      return "Profile not found. Please log in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
