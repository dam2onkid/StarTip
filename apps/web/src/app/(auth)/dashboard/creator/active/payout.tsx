"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateCreatorPayoutOnChain,
  setCreatorActiveOnChain,
} from "@/lib/creators/active";
import {
  readTreasuryAddress,
  payoutAddressWarning,
} from "@/lib/onboarding/register";
import { contractId } from "@/lib/stellar/client";
import { friendlyOnchainError } from "@/lib/stellar/contract-errors";
import { CardTitleWithInfo, AddressRow, PayoutAddressWarning } from "../shared";
import { StatusToast } from "../utils";
import type { CreatorProfile, Status } from "../types";

export function PayoutSummaryCard({ current }: { current: CreatorProfile }) {
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

/** Payout update: enter a new Payout Address, sign + submit, wait for Realtime. */
export function PayoutUpdateCard({ current }: { current: CreatorProfile }) {
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
        kind: "pending",
        message: "Payout update submitted. Your new address will appear shortly.",
      });
    } catch (e) {
      setStatus({ kind: "error", message: friendlyOnchainError(e, "Payout update failed.") });
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
            disabled={status.kind === "busy" || status.kind === "pending"}
            autoComplete="off"
            spellCheck={false}
            placeholder="G…"
            aria-describedby="payout-update-warning"
            data-testid="payout-update-input"
          />
        </div>
        <PayoutAddressWarning id="payout-update-warning" warning={warning} />
        <Button
          type="button"
          size="sm"
          onClick={submit}
          loading={status.kind === "busy" || status.kind === "pending"}
          disabled={status.kind === "busy" || status.kind === "pending" || payout.trim().length === 0}
          className="self-start"
          data-testid="payout-update-submit"
        >
          {status.kind === "pending" ? "Payout Update Pending" : "Update Payout"}
        </Button>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}

/** Self-pause / unpause: sign + submit `set_creator_active_owner`, wait for Realtime. */
export function PauseCard({ current }: { current: CreatorProfile }) {
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
        kind: "pending",
        message: paused
          ? "Unpause submitted. Donations will resume shortly."
          : "Pause submitted. Donations will stop shortly.",
      });
    } catch (e) {
      setStatus({ kind: "error", message: friendlyOnchainError(e, "Pause/unpause failed.") });
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
          loading={status.kind === "busy" || status.kind === "pending"}
          disabled={status.kind === "busy" || status.kind === "pending"}
          className="self-start"
          data-testid="pause-toggle"
        >
          {status.kind === "pending"
            ? paused
              ? "Unpause pending"
              : "Pause pending"
            : paused
              ? "Unpause"
              : "Pause"}
        </Button>
        <StatusToast status={status} />
      </CardContent>
    </Card>
  );
}
