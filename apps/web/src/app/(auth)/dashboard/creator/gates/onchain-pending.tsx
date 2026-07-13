"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  registerCreatorOnChain,
  readTreasuryAddress,
  payoutAddressWarning,
} from "@/lib/onboarding/register";
import { contractId } from "@/lib/stellar/client";
import { friendlyOnchainError } from "@/lib/stellar/contract-errors";
import { PayoutAddressWarning } from "../shared";
import { StatusLine } from "../utils";
import type { CreatorProfile, Status } from "../types";

interface ReconcileResponse {
  onchain_registered?: boolean;
  payout_address?: string | null;
  overlay_id?: string | null;
}

/** Gate 3: register on-chain. */
export function OnchainPendingGate(args: {
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
          const body = (await res.json()) as ReconcileResponse;
          if (body.onchain_registered) {
            onReconciledRef.current({
              payout_address: body.payout_address ?? undefined,
              overlay_id: body.overlay_id ?? undefined,
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
          const body = (await res.json()) as ReconcileResponse;
          if (body.onchain_registered) {
            clearInterval(id);
            onReconciledRef.current({
              payout_address: body.payout_address ?? undefined,
              overlay_id: body.overlay_id ?? undefined,
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
      setStatus({ kind: "error", message: friendlyOnchainError(e, "On-chain registration failed.") });
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
        <PayoutAddressWarning id="payout-warning" warning={warning} />
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
