"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  connectWallet,
  getWalletAddress,
  signWalletMessage,
  classifySignMessageError,
} from "@/lib/wallet/kit";
import { friendlyOnchainError } from "@/lib/stellar/contract-errors";
import { StatusLine, humanError } from "../utils";
import type { CreatorProfile, Status } from "../types";

/** Gate 2: link a wallet via signMessage. */
export function WalletPendingGate(args: {
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
      setStatus({ kind: "error", message: friendlyOnchainError(e, "Could not connect wallet.") });
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
      setStatus({ kind: "error", message: friendlyOnchainError(e, "Could not link wallet.") });
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
