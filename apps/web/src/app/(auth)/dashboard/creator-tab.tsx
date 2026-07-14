"use client";

import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { deriveOnboardingState } from "@/lib/onboarding/state";
import { GateStepper } from "./creator/shared";
import { useOnchainRegisteredRealtime } from "./creator/hooks";
import { ProfilePendingGate } from "./creator/gates/profile-pending";
import { WalletPendingGate } from "./creator/gates/wallet-pending";
import { OnchainPendingGate } from "./creator/gates/onchain-pending";
import { ActiveGate } from "./creator/active";
import { StatusToast } from "./creator/utils";
import type { CreatorProfile, CreatorActiveData, CreatorDonationRow, CreatorTabProps, Status, CreatorSettingsTab, RealtimeStub } from "./creator/types";

export type { CreatorProfile, CreatorActiveData, CreatorDonationRow, CreatorTabProps, Status, CreatorSettingsTab, RealtimeStub };

export function CreatorTab({ profile, activeData, tokens = [] }: CreatorTabProps) {
  const [current, setCurrent] = useState<CreatorProfile>(profile);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const state = deriveOnboardingState(current);

  // Realtime only needs to attach once the wallet is linked and we are waiting
  // on the indexer. Re-attach when the profile id or gate changes.
  useOnchainRegisteredRealtime(current, (next) => {
    setCurrent((prev) => ({ ...prev, onchain_registered: true, ...next }));
    setStatus({ kind: "success", message: "You are live on-chain. Creator is active." });
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
                kind: "pending",
                message: "Registration submitted. Your creator page will be ready shortly.",
              })
            }
            onReconciled={(next) => {
              setCurrent((prev) => ({ ...prev, onchain_registered: true, ...next }));
              setStatus({ kind: "success", message: "You are live on-chain. Creator is active." });
            }}
          />
        )}
        {state === "active" && (
          <>
            <StatusToast status={status} />
            <ActiveGate
              current={current}
              activeData={activeData}
              onUpdate={setCurrent}
              tokens={tokens}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
