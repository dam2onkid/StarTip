"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ClipboardIcon, ImageIcon, InfoIcon, Trash2Icon } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  updateCreatorPayoutOnChain,
  setCreatorActiveOnChain,
} from "@/lib/creators/active";
import { updateDonationModerationStatus } from "@/lib/creators/moderation";
import { contractId } from "@/lib/stellar/client";
import { displayToRawAmount, rawToDisplayAmount } from "@/lib/stellar/amount";
import { friendlyOnchainError } from "@/lib/stellar/contract-errors";
import type { TokenAllowlistEntry } from "@/lib/donations/token";
import { QrCode } from "@/components/creator/qr-code";

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
 *
 * Once `onchain_registered = true` (gate 4 / active), the tab unlocks the
 * active-features panel: stats, per-creator leaderboard, payout updates,
 * self-pause/unpause, profile editing, avatar upload, the Overlay URL, and
 * donation moderation. All on-chain actions (`update_creator_payout`,
 * `set_creator_active_owner`) follow the same client-builds + wallet-signs +
 * submits-to-RPC pattern as `register_creator`, and the dashboard waits for
 * the indexer to mirror the change via Supabase Realtime (ADR-0003: no
 * optimistic UI for these events).
 */

export interface CreatorProfile extends OnboardingProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  banner_url?: string | null;
  bio: string | null;
  /** On-chain payout address; set by the indexer after `CreatorRegistered`. */
  payout_address?: string | null;
  /** Mirrored by the indexer from `CreatorActiveChanged` (`paused = !active`). */
  paused?: boolean;
}

/** A received-donation row for the moderation list (creator RLS, all columns). */
export interface CreatorDonationRow {
  id: string;
  donor_name: string;
  amount: string;
  token: string;
  message: string | null;
  donor_address: string | null;
  user_id: string | null;
  status: string;
  moderation_status: string;
  created_at: string;
}

/** Active-features data loaded server-side and passed into the active panel. */
export interface CreatorActiveData {
  stats: { total: string; count: number };
  leaderboard: { donor_name: string; total_amount: string }[];
  recent: CreatorDonationRow[];
  /** Precomputed donation-goal progress snapshot, or `null` when no goal is set. */
  goal?: { current: string; target: string; pct: number; token: string } | null;
}

export interface CreatorTabProps {
  profile: CreatorProfile;
  activeData?: CreatorActiveData;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

export function CreatorTab({ profile, activeData }: CreatorTabProps) {
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
    <TooltipProvider>
      <div className="dashboard creator-dashboard flex flex-col gap-6">
        {state !== "active" && <GateStepper state={state} />}
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
                message: "Registration submitted. Your creator page will be ready shortly.",
              })
            }
            onReconciled={(next) => {
              setCurrent((prev) => ({ ...prev, onchain_registered: true, ...next }));
              setStatus({ kind: "info", message: "You are live on-chain. Creator is active." });
            }}
          />
        )}
        {state === "active" && (
          <>
            <StatusLine status={status} />
            <ActiveGate current={current} activeData={activeData} onUpdate={setCurrent} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */

/** The four-gate progress indicator. The active gate and those before it are
 * lit; the rest are dim. Rendered as a horizontal track with a fill that
 * advances to the active gate, so progress is legible at a glance. */
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
  const progress = (activeIdx / (order.length - 1)) * 100;
  return (
    <div
      className="creator-gate-stepper rounded-xl border border-foreground/8 bg-foreground/[0.02] p-4"
      data-testid="gate-stepper"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
          Onboarding
        </span>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
          {activeIdx + 1} / {order.length}
        </span>
      </div>
      {/* Progress track: a thin neutral rail with a lime fill to the active gate. */}
      <div
        aria-hidden
        className="relative mb-4 h-1 w-full overflow-hidden rounded-full bg-foreground/8"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:flex sm:items-center sm:justify-between">
        {order.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <li key={s} className="flex min-w-0 items-center gap-2">
              <span
                className={
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[0.65rem] transition-colors " +
                  (active
                    ? "border-primary/60 text-primary bg-primary/10"
                    : done
                      ? "border-foreground/30 text-foreground bg-foreground/5"
                      : "border-foreground/10 text-muted-foreground/50")
                }
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={active ? "truncate text-foreground" : "truncate"}>
                {labels[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={connect}
            loading={status.kind === "busy"}
            disabled={status.kind === "busy"}
          >
            {address ? "Reconnect wallet" : "Connect wallet"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={link}
            loading={status.kind === "busy"}
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
  /** Invoked when the on-chain reconcile read confirms the creator is registered. */
  onReconciled: (next: Partial<CreatorProfile>) => void;
}) {
  const { current, status, setStatus, onSubmitted, onReconciled } = args;
  const [payout, setPayout] = useState("");
  const [treasury, setTreasury] = useState<string | null | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const onReconciledRef = useRef(onReconciled);

  useEffect(() => {
    onReconciledRef.current = onReconciled;
  }, [onReconciled]);

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

  // Reconcile with the on-chain registry. This recovers creators whose
  // `CreatorRegistered` event was never mirrored by the indexer (e.g. emitted
  // before the indexer's first poll): it reads `get_creator(sha256(handle))`
  // directly and flips `onchain_registered` when the entry exists and the owner
  // matches. Runs once on mount, and again after a successful submission with a
  // short retry loop so the just-closed ledger is picked up.
  useEffect(() => {
    if (!current.handle || !current.owner_address) return;
    let alive = true;
    const controller = new AbortController();

    async function reconcile() {
      try {
        const res = await fetch("/api/creators/reconcile", {
          method: "POST",
          signal: controller.signal,
        });
        if (!alive) return;
        if (res.ok) {
          const body = (await res.json()) as {
            onchain_registered?: boolean;
            payout_address?: string | null;
          };
          if (body.onchain_registered) {
            onReconciledRef.current({
              payout_address: body.payout_address ?? undefined,
            });
          }
        }
      } catch {
        // Network / abort: stay silent; the indexer Realtime path is the
        // other recovery channel.
      }
    }

    void reconcile();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [current.handle, current.owner_address]);

  // After a successful on-chain submission, poll reconcile a few times so the
  // just-closed ledger is picked up even if the indexer event is delayed.
  useEffect(() => {
    if (!submitted) return;
    let alive = true;
    const controller = new AbortController();
    let attempt = 0;
    const id = setInterval(async () => {
      attempt++;
      if (attempt > 6 || !alive) {
        clearInterval(id);
        return;
      }
      try {
        const res = await fetch("/api/creators/reconcile", {
          method: "POST",
          signal: controller.signal,
        });
        if (!alive) return;
        if (res.ok) {
          const body = (await res.json()) as {
            onchain_registered?: boolean;
            payout_address?: string | null;
          };
          if (body.onchain_registered) {
            clearInterval(id);
            onReconciledRef.current({
              payout_address: body.payout_address ?? undefined,
            });
          }
        }
      } catch {
        // ignore; next interval retries
      }
    }, 5000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(id);
    };
  }, [submitted]);

  const warning = useMemo(
    () =>
      treasury === undefined
        ? null
        : payoutAddressWarning(payout.trim(), { contractId, treasuryAddress: treasury }),
    [payout, treasury],
  );
  const isSubmitting = status.kind === "busy";
  const isAwaitingIndexer = submitted && status.kind === "info";
  const isRegisterLocked = isSubmitting || isAwaitingIndexer;

  async function register() {
    if (!current.owner_address || !current.handle) return;
    setStatus({ kind: "busy" });
    try {
      await registerCreatorOnChain({
        ownerAddress: current.owner_address,
        handle: current.handle,
        payoutAddress: payout.trim(),
      });
      setSubmitted(true);
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
          Set the wallet address where tips should be paid. You will approve this once
          with your wallet.
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
          <Input
            id="payout-input"
            name="payoutAddress"
            className="flex-1"
            value={payout}
            onChange={(e) => setPayout(e.target.value)}
            disabled={isRegisterLocked}
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
          loading={isRegisterLocked}
          disabled={isRegisterLocked || payout.trim().length === 0}
          className="self-start"
        >
          {isAwaitingIndexer ? "Confirming registration" : "Register Creator"}
        </Button>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Gate 4: active. The full Creator active-features panel.
 *
 * The active features are grouped into three labeled sections so the panel
 * reads as a small set of themed areas instead of one long vertical stack:
 *   1. Status & stats: read-only overview (registration, totals, top donors).
 *   2. Controls: wallet-signed actions and public identity (payout, pause,
 *      profile edit, overlay URL).
 *   3. Moderation: incoming donations and visibility toggles.
 *
 * Each section renders full-width rows (see `.creator-section-list` in
 * `globals.css`): the row title and description stay on the left, while the
 * controls and data sit on the right, then collapse cleanly on mobile.
 */
function ActiveGate(args: {
  current: CreatorProfile;
  activeData?: CreatorActiveData;
  onUpdate: (updater: (prev: CreatorProfile) => CreatorProfile) => void;
}) {
  const { current, activeData, onUpdate } = args;
  const [tab, setTab] = useState<CreatorSettingsTab>("overview");
  // Subscribe to Realtime on the profile row so `payout_address` and `paused`
  // flips (mirrored by the indexer after `update_creator_payout` /
  // `set_creator_active_owner`) land without a manual refresh.
  useCreatorActiveRealtime(current, (next) => {
    onUpdate((prev) => ({ ...prev, ...next }));
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as CreatorSettingsTab)}
      className="creator-settings-shell"
      data-testid="creator-active"
    >
      <CreatorSettingsSidebar
        current={current}
        activeData={activeData}
        tab={tab}
        onTabChange={setTab}
      />
      <div className="creator-settings-panel">
        <TabsContent value="overview" className="m-0">
          <CreatorSettingsSection
            eyebrow="Overview"
            title="Creator Overview"
            description="Track tips, supporter activity, and the public status donors see."
          >
            <StatsCard activeData={activeData} />
            <LeaderboardCard activeData={activeData} />
            <CreatorStatusCard current={current} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="profile" className="m-0">
          <CreatorSettingsSection
            eyebrow="Profile & Links"
            title="Public Profile"
            description="Keep your creator page ready to share."
          >
            <ProfileEditCard current={current} onUpdate={onUpdate} />
            <PublicLinksCard handle={current.handle} />
            <QrCodeCard handle={current.handle} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="payout" className="m-0">
          <CreatorSettingsSection
            eyebrow="Payout"
            title="Payout & Availability"
            description="Update where tips are paid and pause receiving tips when needed."
          >
            <PayoutSummaryCard current={current} />
            <PayoutUpdateCard current={current} />
            <PauseCard current={current} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="overlay" className="m-0">
          <CreatorSettingsSection
            eyebrow="Overlay"
            title="Stream Overlay"
            description="Copy your overlay URL and tune how alerts appear on stream."
          >
            <OverlayUrlCard handle={current.handle} />
            <OverlaySettingsCard handle={current.handle} />
            <DonationGoalCard handle={current.handle} goal={activeData?.goal ?? null} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="moderation" className="m-0">
          <CreatorSettingsSection
            eyebrow="Moderation"
            title="Donation Visibility"
            description="Hide or restore donations shown on your public surfaces."
          >
            <ModerationCard activeData={activeData} />
          </CreatorSettingsSection>
        </TabsContent>
      </div>
    </Tabs>
  );
}

type CreatorSettingsTab =
  | "overview"
  | "profile"
  | "payout"
  | "overlay"
  | "moderation";

function CreatorSettingsSidebar({
  current,
  activeData,
  tab,
  onTabChange,
}: {
  current: CreatorProfile;
  activeData?: CreatorActiveData;
  tab: CreatorSettingsTab;
  onTabChange: (tab: CreatorSettingsTab) => void;
}) {
  const paused = current.paused ?? false;
  const items: { id: CreatorSettingsTab; label: string; detail: string }[] = [
    { id: "overview", label: "Overview", detail: "Tips and supporters" },
    { id: "profile", label: "Profile & Links", detail: "Public page and QR" },
    { id: "payout", label: "Payout", detail: "Address and availability" },
    { id: "overlay", label: "Overlay", detail: "Stream alerts and goal" },
    { id: "moderation", label: "Moderation", detail: "Donation visibility" },
  ];
  return (
    <aside className="creator-settings-sidebar" aria-label="Creator settings">
      <div className="creator-settings-profile">
        <div className="min-w-0">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
            Creator
          </span>
          <h2 className="mt-1 truncate font-display text-xl font-semibold text-foreground">
            {current.display_name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">@{current.handle}</p>
        </div>
        <span className="status-pill" data-tone={paused ? "paused" : "active"}>
          <span className="dot" aria-hidden />
          {paused ? "Paused" : "Active"}
        </span>
      </div>
      <dl className="creator-settings-quick-stats">
        <div>
          <dt>Total Received</dt>
          <dd>{activeData?.stats.total ?? "0"}</dd>
        </div>
        <div>
          <dt>Donations</dt>
          <dd>{activeData?.stats.count ?? 0}</dd>
        </div>
      </dl>
      <TabsList className="creator-settings-nav" aria-label="Creator tabs">
        {items.map((item) => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            className="creator-settings-tab"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.detail}</small>
          </TabsTrigger>
      ))}
      </TabsList>
    </aside>
  );
}

function CreatorSettingsSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="creator-settings-section">
      <header className="creator-settings-section-header">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="creator-settings-list">{children}</div>
    </section>
  );
}

function CreatorStatusCard({ current }: { current: CreatorProfile }) {
  const paused = current.paused ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Creator Status"
          info="This is the availability donors see when they visit your page."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground">
        <p className="creator-address-row" data-testid="onchain-paused">
          <span>Status</span>
          <span className="status-pill" data-tone={paused ? "paused" : "active"}>
            <span className="dot" aria-hidden />
            {paused ? "Paused" : "Active"}
          </span>
        </p>
        <AddressRow label="Wallet" value={current.owner_address} testId="onchain-owner" />
        <AddressRow
          label="Payout"
          value={current.payout_address ?? null}
          fallback="Not set"
          testId="onchain-payout"
        />
      </CardContent>
    </Card>
  );
}

function PayoutSummaryCard({ current }: { current: CreatorProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Current Payout"
          info="Tips are sent to this payout address."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground">
        <AddressRow
          label="Payout"
          value={current.payout_address ?? null}
          fallback="Not set"
          testId="payout-current-address"
        />
        <AddressRow label="Wallet" value={current.owner_address} testId="payout-owner-address" />
      </CardContent>
    </Card>
  );
}

function PublicLinksCard({ handle }: { handle: string | null }) {
  if (!handle) return null;
  const path = `/creator/${handle}/donate`;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donate Page"
          info="Share this link anywhere supporters already follow you."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CopyValueRow
          label="Donate URL"
          value={path}
          copyValue={path}
          absoluteUrl
          testId="creator-donate-url"
        />
      </CardContent>
    </Card>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "C";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "C";
}

function EmptyState({
  eyebrow,
  message,
}: {
  eyebrow: string;
  message: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-eyebrow">{eyebrow}</span>
      <p className="text-sm text-muted-foreground text-pretty">{message}</p>
    </div>
  );
}

function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="creator-info-trigger"
          aria-label={label}
        >
          <InfoIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

function CardTitleWithInfo({
  title,
  info,
}: {
  title: string;
  info: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <CardTitle>{title}</CardTitle>
      <InfoTooltip label={`${title} info`}>{info}</InfoTooltip>
    </div>
  );
}

function AddressRow({
  label,
  value,
  fallback = "Not set",
  testId,
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
  testId: string;
}) {
  return (
    <CopyValueRow label={label} value={value || fallback} copyValue={value || ""} testId={testId} />
  );
}

function CopyValueRow({
  label,
  value,
  copyValue,
  absoluteUrl = false,
  testId,
  copyTestId,
}: {
  label: string;
  value: string;
  copyValue: string;
  absoluteUrl?: boolean;
  testId: string;
  copyTestId?: string;
}) {
  return (
    <div className="creator-address-row" data-testid={testId}>
      <span>{label}</span>
      <span className="creator-copy-value">
        <span className="min-w-0 break-all font-mono text-foreground">{value}</span>
        {copyValue ? (
          <CopyValueButton
            label={`Copy ${label}`}
            value={copyValue}
            absoluteUrl={absoluteUrl}
            testId={copyTestId}
          />
        ) : null}
      </span>
    </div>
  );
}

function CopyValueButton({
  label,
  value,
  absoluteUrl = false,
  testId,
}: {
  label: string;
  value: string;
  absoluteUrl?: boolean;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function copy() {
    setCopying(true);
    try {
      const text =
        absoluteUrl && typeof window !== "undefined"
          ? new URL(value, window.location.origin).toString()
          : value;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    } finally {
      setCopying(false);
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={copy}
      loading={copying}
      disabled={copying}
      aria-label={copied ? "Copied" : label}
      className="creator-copy-button"
      data-testid={testId}
    >
      {copying ? null : copied ? <CheckIcon aria-hidden /> : <ClipboardIcon aria-hidden />}
    </Button>
  );
}

/** Stats: total received and donation count (including hidden). */
function StatsCard({ activeData }: { activeData?: CreatorActiveData }) {
  const total = activeData?.stats.total ?? "0";
  const count = activeData?.stats.count ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Stats"
          info="Total received and donation count, including hidden donations."
        />
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="creator-metric-tile">
            <dt className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
              Total received
            </dt>
            <dd className="stat-hero text-foreground" data-testid="creator-total-received">
              {total}
            </dd>
          </div>
          <div className="creator-metric-tile">
            <dt className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
              Donations
            </dt>
            <dd
              className="font-display text-3xl font-semibold tracking-tight text-foreground tabular-nums"
              data-testid="creator-donation-count"
            >
              {count}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Per-creator leaderboard: top Donors to this Creator (logged-in donors only). */
function LeaderboardCard({ activeData }: { activeData?: CreatorActiveData }) {
  const leaderboard = activeData?.leaderboard ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Top Donors"
          info="Your top donors, ranked by total donated. Anonymous donations are excluded."
        />
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <EmptyState
            eyebrow="No Supporters"
            message="Share your creator page to start building a ranked supporter list."
          />
        ) : (
          <ol className="flex flex-col gap-2" data-testid="creator-leaderboard">
            {leaderboard.map((entry, i) => (
              <li
                key={entry.donor_name}
                className="row-inset flex items-center justify-between px-3 py-2"
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-medium text-foreground">{entry.donor_name}</span>
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
  );
}

/** Payout update: enter a new Payout Address, sign + submit, wait for Realtime. */
function PayoutUpdateCard({ current }: { current: CreatorProfile }) {
  const [payout, setPayout] = useState("");
  const [treasury, setTreasury] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    let alive = true;
    readTreasuryAddress()
      .then((t) => { if (alive) setTreasury(t); })
      .catch(() => { if (alive) setTreasury(null); });
    return () => { alive = false; };
  }, []);

  const warning = useMemo(
    () =>
      treasury === undefined
        ? null
        : payoutAddressWarning(payout.trim(), { contractId, treasuryAddress: treasury }),
    [payout, treasury],
  );

  async function submit() {
    if (!current.owner_address || !current.handle) return;
    setStatus({ kind: "busy" });
    try {
      await updateCreatorPayoutOnChain({
        ownerAddress: current.owner_address,
        handle: current.handle,
        newPayoutAddress: payout.trim(),
      });
      setStatus({
        kind: "info",
        message: "Payout update submitted. Your new address will appear shortly.",
      });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Payout update failed.") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Update Payout Address"
          info="Approve this change with your wallet. New tips will use the updated address once confirmed."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="payout-update-input">
            New Payout Address
          </label>
          <Input
            id="payout-update-input"
            name="newPayoutAddress"
            className="flex-1"
            value={payout}
            onChange={(e) => { setPayout(e.target.value); setStatus({ kind: "idle" }); }}
            autoComplete="off"
            spellCheck={false}
            placeholder="G…"
            aria-describedby="payout-update-warning"
            data-testid="payout-update-input"
          />
        </div>
        {warning ? (
          <p id="payout-update-warning" className="text-xs text-destructive">
            Warning: this is the {warning === "contract" ? "contract address" : "Treasury address"}.
            The contract will not reject it and funds sent there will be stranded.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={submit}
          loading={status.kind === "busy"}
          disabled={status.kind === "busy" || payout.trim().length === 0}
          className="self-start"
          data-testid="payout-update-submit"
        >
          {status.kind === "info" ? "Payout Update Pending" : "Update Payout"}
        </Button>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/** Self-pause / unpause: sign + submit `set_creator_active_owner`, wait for Realtime. */
function PauseCard({ current }: { current: CreatorProfile }) {
  const paused = current.paused ?? false;
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function toggle() {
    if (!current.owner_address || !current.handle) return;
    setStatus({ kind: "busy" });
    try {
      await setCreatorActiveOnChain({
        ownerAddress: current.owner_address,
        handle: current.handle,
        active: paused,
      });
      setStatus({
        kind: "info",
        message: paused
          ? "Unpause submitted. Donations will resume shortly."
          : "Pause submitted. Donations will stop shortly.",
      });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Pause/unpause failed.") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Pause Donations"
          info="Pause when you do not want to receive new tips. You can resume any time."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground" data-testid="pause-status">
          Current status: <span className="font-mono text-foreground">
            {paused ? "paused" : "active"}
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={toggle}
          loading={status.kind === "busy"}
          disabled={status.kind === "busy"}
          className="self-start"
          data-testid="pause-toggle"
        >
          {status.kind === "info"
            ? paused
              ? "Unpause pending"
              : "Pause pending"
            : paused
              ? "Unpause"
              : "Pause"}
        </Button>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/** Profile edit: display_name, avatar_url, bio via owner UPDATE RLS + avatar upload. */
function ProfileEditCard(args: {
  current: CreatorProfile;
  onUpdate: (updater: (prev: CreatorProfile) => CreatorProfile) => void;
}) {
  const { current, onUpdate } = args;
  const [displayName, setDisplayName] = useState(current.display_name);
  const [bio, setBio] = useState(current.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(current.avatar_url);
  const [bannerUrl, setBannerUrl] = useState<string | null>(current.banner_url ?? null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      let nextAvatarUrl = avatarUrl;
      let nextBannerUrl = bannerUrl;
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${current.user_id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("avatars").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;
        nextAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const bannerFile = bannerInputRef.current?.files?.[0];
      if (bannerFile) {
        const ext = bannerFile.name.split(".").pop() ?? "png";
        const path = `${current.user_id}/banner-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("avatars").upload(path, bannerFile, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;
        nextBannerUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const update: {
        display_name: string;
        bio: string;
        avatar_url?: string | null;
        banner_url?: string | null;
      } = {
        display_name: displayName.trim() || "Anonymous",
        bio: bio.trim(),
      };
      if (nextAvatarUrl !== current.avatar_url) {
        update.avatar_url = nextAvatarUrl;
      }
      if (nextBannerUrl !== (current.banner_url ?? null)) {
        update.banner_url = nextBannerUrl;
      }
      const res = await supabase.from("profiles").update(update).eq("user_id", current.user_id);
      if (res.error) throw res.error;
      setAvatarUrl(nextAvatarUrl);
      setBannerUrl(nextBannerUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      onUpdate((prev) => ({
        ...prev,
        display_name: update.display_name,
        bio: update.bio,
        avatar_url: nextAvatarUrl,
        banner_url: nextBannerUrl,
      }));
      setStatus({ kind: "saved" });
    } catch (e) {
      let message = "Could not save profile.";
      if (e instanceof Error && e.message) message = e.message;
      else if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string")
        message = (e as { message: string }).message;
      setStatus({ kind: "error", message });
    }
  }

  async function removeBackground() {
    setStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      const res = await supabase
        .from("profiles")
        .update({ banner_url: null })
        .eq("user_id", current.user_id);
      if (res.error) throw res.error;
      setBannerUrl(null);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      onUpdate((prev) => ({ ...prev, banner_url: null }));
      setStatus({ kind: "saved" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Could not remove background.") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Edit your creator profile"
          info="Your display name, avatar, and bio appear on your public creator page."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="creator-profile-editor">
          <div className="creator-profile-cover">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="creator-background-fallback" aria-hidden />
            )}
            <div className="creator-profile-cover-actions">
              <label className="creator-file-action" htmlFor="creator-background-input">
                <ImageIcon data-icon="inline-start" aria-hidden />
                Change background
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={removeBackground}
                loading={status.kind === "saving"}
                disabled={status.kind === "saving" || !bannerUrl}
                data-testid="creator-background-remove"
              >
                <Trash2Icon data-icon="inline-start" aria-hidden />
                Remove
              </Button>
            </div>
            <input
              id="creator-background-input"
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              data-testid="creator-background-input"
              onChange={() => setStatus({ kind: "idle" })}
            />
          </div>
          <div className="creator-profile-photo-row">
            <div className="creator-profile-avatar">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                  data-testid="creator-avatar-preview"
                />
              ) : (
                <span data-testid="creator-avatar-placeholder">{initials(displayName)}</span>
              )}
              <label className="creator-avatar-action" htmlFor="creator-avatar-input">
                <ImageIcon aria-hidden />
                <span className="sr-only">Change avatar</span>
              </label>
            </div>
            <div className="creator-profile-photo-copy">
              <strong>Edit your photo</strong>
              <span>PNG, JPG, GIF, or WebP. Wide images work best for the background.</span>
            </div>
            <label className="creator-file-action" htmlFor="creator-avatar-input">
              <ImageIcon data-icon="inline-start" aria-hidden />
              Change photo
            </label>
            <input
              id="creator-avatar-input"
              name="avatar"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="creator-avatar-input"
              onChange={() => setStatus({ kind: "idle" })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="creator-display-name-input">
            Display name
          </label>
          <Input
            id="creator-display-name-input"
            name="displayName"
            className="flex-1"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setStatus({ kind: "idle" }); }}
            placeholder="Anonymous"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="creator-bio-input">
            Bio
          </label>
          <textarea
            id="creator-bio-input"
            name="bio"
            className="min-h-20 flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            value={bio}
            onChange={(e) => { setBio(e.target.value); setStatus({ kind: "idle" }); }}
            placeholder="Tell donors about yourself."
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={save}
          loading={status.kind === "saving"}
          disabled={status.kind === "saving"}
          className="self-start"
          data-testid="creator-profile-save"
        >
          Save profile
        </Button>
        {status.kind === "saved" && (
          <p className="text-xs text-tertiary" aria-live="polite" data-testid="creator-save-status">
            Profile saved.
          </p>
        )}
        {status.kind === "error" && (
          <p className="text-xs text-destructive" aria-live="polite" role="alert" data-testid="creator-save-status">
            {status.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Overlay URL: show `/overlay/[handle]` with a copy action. */
function OverlayUrlCard({ handle }: { handle: string | null }) {
  const path = handle ? `/overlay/${handle}` : "";
  if (!handle) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Overlay URL"
          info="Add this URL as a browser source in OBS to show donation alerts on your stream."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CopyValueRow
          label="Overlay URL"
          value={path}
          copyValue={path}
          absoluteUrl
          testId="overlay-url"
          copyTestId="overlay-copy"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Overlay Settings card: configure alert duration, min amount, and sound.
 *
 * Loads the Creator's `overlay_settings` row on mount (GET
 * `/api/overlay-settings?handle=...`), renders editable fields, and PUTs the
 * validated payload back. The PUT goes through the authed API route which
 * upserts via the session client so the owner-write RLS policies apply.
 *
 * `min_amount` is a display-amount numeric (the same units the Creator sees
 * on the donate form); the server converts it to raw units (multiplied by
 * 10^decimals) before handing it to the Overlay client.
 */
function OverlaySettingsCard({ handle }: { handle: string | null }) {
  const [durationMs, setDurationMs] = useState<number>(6000);
  const [minAmount, setMinAmount] = useState<string>("0");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Load the current settings on mount (and when the handle changes).
  useEffect(() => {
    if (!handle) return;
    let alive = true;
    fetch(`/api/overlay-settings?handle=${encodeURIComponent(handle)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          alert_duration_ms?: number;
          min_amount?: string | number;
          sound_enabled?: boolean;
        };
        if (!alive) return;
        setDurationMs(body.alert_duration_ms ?? 6000);
        setMinAmount(String(body.min_amount ?? "0"));
        setSoundEnabled(body.sound_enabled !== false);
      })
      .catch(() => {
        // Network error: keep defaults; the user can still save.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  if (!handle) return null;

  async function save() {
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/overlay-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alert_duration_ms: durationMs,
          min_amount: Number(minAmount),
          sound_enabled: soundEnabled,
        }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as {
          min_amount: string | number;
        };
        setMinAmount(String(body.min_amount));
        setStatus({ kind: "info", message: "Overlay settings saved." });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({
          kind: "error",
          message:
            body.error === "unauthorized"
              ? "Sign in again to save overlay settings."
              : body.error === "not_creator"
                ? "Claim a handle first."
                : humanError(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not save overlay settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Overlay settings"
          info="Control how donation alerts behave on your stream overlay: how long each alert stays on screen, the minimum donation amount that triggers an alert, and whether a sound plays on new donations."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4" data-testid="overlay-settings-card">
        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-duration-input"
          >
            Alert duration (ms)
          </label>
          <Input
            id="overlay-duration-input"
            type="number"
            min={1000}
            max={60000}
            step={500}
            className="max-w-[10rem]"
            value={durationMs}
            disabled={loading || saving}
            onChange={(e) => setDurationMs(Number(e.target.value))}
            data-testid="overlay-duration-input"
          />
          <p className="text-[0.65rem] text-muted-foreground/70">
            1000–60000ms. Default 6000ms (6 seconds).
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-min-amount-input"
          >
            Minimum amount
          </label>
          <Input
            id="overlay-min-amount-input"
            type="number"
            min={0}
            step="0.01"
            className="max-w-[10rem]"
            value={minAmount}
            disabled={loading || saving}
            onChange={(e) => setMinAmount(e.target.value)}
            data-testid="overlay-min-amount-input"
          />
          <p className="text-[0.65rem] text-muted-foreground/70">
            Donations below this amount are silently recorded but not shown.
            0 shows every donation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="overlay-sound-toggle"
            type="checkbox"
            className="h-4 w-4 rounded border-foreground/20 accent-primary"
            checked={soundEnabled}
            disabled={loading || saving}
            onChange={(e) => setSoundEnabled(e.target.checked)}
            data-testid="overlay-sound-toggle"
          />
          <label
            className="text-xs text-muted-foreground"
            htmlFor="overlay-sound-toggle"
          >
            Play a sound on new donations
          </label>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={save}
          loading={saving}
          disabled={loading || saving}
          className="self-start"
          data-testid="overlay-settings-save"
        >
          Save
        </Button>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/** Donate QR: a scannable QR encoding `/creator/[handle]/donate` + PNG download. */
function QrCodeCard({ handle }: { handle: string | null }) {
  if (!handle) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donate QR code"
          info={
            <>
              Scan this to land on your donate page. Download the PNG and drop it
              on a livestream so fans can tip from their phone.
            </>
          }
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <QrCode handle={handle} downloadable showUrl />
      </CardContent>
    </Card>
  );
}

/**
 * Donation Goal card: set a target amount + token, see progress toward it,
 * and clear the goal. The progress snapshot (`current`, `target`, `pct`,
 * `token`) is computed server-side from confirmed/indexed visible donations
 * in the goal's token and passed in via `goal`. The editable target + token
 * are fetched on mount from the public goal API; the token picker is fed from
 * the public `tokens` allowlist (browser client, public SELECT).
 *
 * `target_amount` is stored in raw i128 units (matching `donations.amount`).
 * The card converts the Creator's display input to raw via the selected
 * token's `decimals` before PUTting, and converts the raw `current`/`target`
 * back to display units for the progress readout. `target_amount = 0` deletes
 * the row (clears the goal).
 */
function DonationGoalCard({
  handle,
  goal,
}: {
  handle: string | null;
  goal: { current: string; target: string; pct: number; token: string } | null;
}) {
  const [tokens, setTokens] = useState<TokenAllowlistEntry[]>([]);
  const [tokenContract, setTokenContract] = useState<string>("");
  const [targetDisplay, setTargetDisplay] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Live progress: the server-provided `current` (raw) is the source of truth
  // for the sum; the target tracks the edited input so the bar updates as the
  // Creator types. `pct` is recomputed locally with BigInt.
  const [liveTargetRaw, setLiveTargetRaw] = useState<string>(goal?.target ?? "0");

  // Load the token allowlist (public SELECT) and the current goal on mount.
  useEffect(() => {
    if (!handle) return;
    let alive = true;

    const supabase = createBrowserClient();
    const tokensPromise = supabase
      .from("tokens")
      .select("contract_address,symbol,name,issuer,decimals,icon_url")
      .then(({ data, error: fetchErr }) => {
        if (fetchErr || !data) return [] as TokenAllowlistEntry[];
        return data as TokenAllowlistEntry[];
      });

    const goalPromise = fetch(
      `/api/creators/${encodeURIComponent(handle)}/goal`,
    ).then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as { target_amount: string; token: string } | null;
    });

    Promise.all([tokensPromise, goalPromise])
      .then(([toks, g]) => {
        if (!alive) return;
        setTokens(toks);
        if (g) {
          setTokenContract(g.token);
          const tk = toks.find((t) => t.contract_address === g.token);
          setTargetDisplay(tk ? rawToDisplayAmount(g.target_amount, tk.decimals) : g.target_amount);
          setLiveTargetRaw(g.target_amount);
        } else {
          setTokenContract(toks[0]?.contract_address ?? "");
          setTargetDisplay("");
          setLiveTargetRaw("0");
        }
      })
      .catch(() => {
        // Network error: keep defaults; the user can still save.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [handle]);

  if (!handle) return null;

  const selectedToken = tokens.find((t) => t.contract_address === tokenContract) ?? null;
  const decimals = selectedToken?.decimals ?? 0;

  // Live pct from the server-provided raw `current` and the edited raw target.
  const currentRaw = goal?.current ?? "0";
  const pct = computePct(currentRaw, liveTargetRaw);

  async function save() {
    if (!handle) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const raw = displayToRawAmount(targetDisplay, decimals);
      const res = await fetch(
        `/api/creators/${encodeURIComponent(handle)}/goal`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_amount: Number(raw), token: tokenContract }),
        },
      );
      if (res.status === 200) {
        const body = (await res.json()) as { target_amount: number | string; token: string };
        const rawTarget = String(body.target_amount);
        setLiveTargetRaw(rawTarget);
        const tk = tokens.find((t) => t.contract_address === body.token);
        setTargetDisplay(tk ? rawToDisplayAmount(rawTarget, tk.decimals) : rawTarget);
        setStatus({
          kind: "info",
          message: Number(rawTarget) === 0 ? "Donation goal cleared." : "Donation goal saved.",
        });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({
          kind: "error",
          message:
            body.error === "unauthorized"
              ? "Sign in again to save your goal."
              : body.error === "not_creator"
                ? "Claim a handle first."
                : body.error === "forbidden"
                  ? "You can only set your own goal."
                  : body.error === "token_not_allowed"
                    ? "That token is not on the allowlist."
                    : humanError(body.error),
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not save the donation goal." });
    } finally {
      setSaving(false);
    }
  }

  async function clearGoal() {
    if (!handle) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch(
        `/api/creators/${encodeURIComponent(handle)}/goal`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_amount: 0, token: tokenContract }),
        },
      );
      if (res.status === 200) {
        setTargetDisplay("");
        setLiveTargetRaw("0");
        setStatus({ kind: "info", message: "Donation goal cleared." });
      } else {
        const body = (await res.json()) as { error: string };
        setStatus({ kind: "error", message: humanError(body.error) });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not clear the donation goal." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donation goal"
          info={
            <>
              Set a target amount for your supporters to see on your public
              profile. Progress reflects only confirmed donations in the
              goal&apos;s token. Set the target to 0 or use Clear to remove the
              goal.
            </>
          }
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4" data-testid="donation-goal-card">
        {/* Progress readout. Hidden until a goal is set (no row = no goal). */}
        {goal ? (
          <div className="flex flex-col gap-2" data-testid="donation-goal-progress">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span
                className="font-mono text-sm text-foreground"
                data-testid="donation-goal-pct"
              >
                {pct}%
              </span>
            </div>
            <div
              aria-hidden
              className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/8"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
                data-testid="donation-goal-bar"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span data-testid="donation-goal-current">
                {rawToDisplayAmount(currentRaw, decimals)}
              </span>
              <span data-testid="donation-goal-target">
                of {rawToDisplayAmount(liveTargetRaw, decimals)} {selectedToken?.symbol ?? ""}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="donation-goal-empty">
            No goal set. Pick a token and a target below to show progress on your profile.
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="donation-goal-target-input"
          >
            Target amount
          </label>
          <Input
            id="donation-goal-target-input"
            type="number"
            min={0}
            step="0.01"
            className="max-w-[12rem]"
            value={targetDisplay}
            disabled={loading || saving}
            onChange={(e) => {
              setTargetDisplay(e.target.value);
              setLiveTargetRaw(displayToRawAmount(e.target.value, decimals));
            }}
            data-testid="donation-goal-target-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="donation-goal-token-select"
          >
            Token
          </label>
          <select
            id="donation-goal-token-select"
            className="max-w-[12rem] rounded-md border border-foreground/10 bg-background px-3 py-2 text-sm"
            value={tokenContract}
            disabled={loading || saving || tokens.length === 0}
            onChange={(e) => {
              setTokenContract(e.target.value);
              const tk = tokens.find((t) => t.contract_address === e.target.value);
              setLiveTargetRaw(displayToRawAmount(targetDisplay, tk?.decimals ?? 0));
            }}
            data-testid="donation-goal-token-select"
          >
            {tokens.length === 0 && <option value="">No tokens</option>}
            {tokens.map((t) => (
              <option key={t.contract_address} value={t.contract_address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={save}
            loading={saving}
            disabled={loading || saving || !tokenContract}
            data-testid="donation-goal-save"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearGoal}
            loading={saving}
            disabled={loading || saving || !goal}
            data-testid="donation-goal-clear"
          >
            Clear
          </Button>
        </div>
        <StatusLine status={status} />
      </CardContent>
    </Card>
  );
}

/** Compute a clamped 0-100 integer percentage from two raw numeric strings. */
function computePct(currentRaw: string, targetRaw: string): number {
  let current: bigint;
  let target: bigint;
  try {
    current = BigInt(currentRaw);
    target = BigInt(targetRaw);
  } catch {
    return 0;
  }
  if (target <= BigInt(0)) return 0;
  const ratio = (current * BigInt(100)) / target;
  if (ratio > BigInt(100)) return 100;
  if (ratio < BigInt(0)) return 0;
  return Number(ratio);
}

/** Moderation: list incoming donations (including hidden), toggle visibility. */
function ModerationCard({ activeData }: { activeData?: CreatorActiveData }) {
  const recent = useMemo(() => activeData?.recent ?? [], [activeData?.recent]);
  const [rows, setRows] = useState<CreatorDonationRow[]>(recent);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep local rows in sync when the server-provided snapshot changes.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRows(recent);
      setError(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [recent]);

  async function toggle(row: CreatorDonationRow) {
    const next = row.moderation_status === "visible" ? "hidden" : "visible";
    setBusyId(row.id);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const res = await updateDonationModerationStatus(supabase, row.id, next);
      if (!res.ok) {
        setError(res.error ?? "Could not update moderation status.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, moderation_status: next } : r)),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Moderation"
          info="Toggle a donation's visibility. Hidden donations do not appear on the Overlay."
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            eyebrow="No Donations"
            message="New donations will land here with visibility controls for your overlay."
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="moderation-list">
            {rows.map((d) => (
              <li
                key={d.id}
                className="row-inset flex items-center justify-between px-3 py-2"
              >
                <span className="flex flex-col">
                  <span className="font-mono text-sm text-foreground">
                    {d.amount} {d.token}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.donor_name}
                    {d.message ? ` · ${d.message}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.moderation_status === "hidden" ? "hidden" : "visible"}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => toggle(d)}
                  loading={busyId === d.id}
                  disabled={busyId === d.id}
                  data-testid={`moderation-toggle-${d.id}`}
                  aria-label={`Toggle visibility for donation ${d.id}`}
                >
                  {d.moderation_status === "visible" ? "Hide" : "Show"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert" data-testid="moderation-error">
            {error}
          </p>
        )}
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
  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

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

/**
 * Subscribe to Supabase Realtime on the caller's profile row and invoke the
 * callback when the indexer mirrors a `payout_address` or `paused` change
 * (from `update_creator_payout` / `set_creator_active_owner`). Only attaches
 * once the Creator is on-chain registered (the active panel).
 *
 * Test seam: when `window.__STARTIP_REALTIME_STUB__` is present, the hook
 * registers the callback with the stub so E2E can push the
 * `payout_address` / `paused` flip deterministically without a WebSocket.
 */
function useCreatorActiveRealtime(
  profile: CreatorProfile,
  onUpdate: (next: Partial<CreatorProfile>) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!profile.onchain_registered) return; // only active Creators need this

    const stub =
      typeof window !== "undefined" ? window.__STARTIP_REALTIME_STUB__ : undefined;
    if (stub) {
      return stub.subscribe((next) => onUpdateRef.current(next));
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`profiles-active:${profile.id}`)
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
            payout_address?: string | null;
            paused?: boolean;
          };
          const update: Partial<CreatorProfile> = {};
          if (next.payout_address !== undefined) {
            update.payout_address = next.payout_address;
          }
          if (next.paused !== undefined) {
            update.paused = next.paused;
          }
          if (Object.keys(update).length > 0) {
            onUpdateRef.current(update);
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
  return friendlyOnchainError(err, fallback);
}
