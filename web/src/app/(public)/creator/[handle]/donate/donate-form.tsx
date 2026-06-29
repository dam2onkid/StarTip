"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { connectWallet, getWalletAddress, signWalletTransaction } from "@/lib/wallet/kit";
import { contractId, getRpc, networkPassphrase } from "@/lib/stellar/client";
import { handleHashBuffer } from "@/lib/creators/handle-shared";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  donateOnChain,
  DonateError,
  DONATE_ERROR_MESSAGES,
  type DonateErrorCode,
} from "@/lib/donations/donate";
import type { TokenAllowlistEntry } from "@/lib/donations/prepare";

/**
 * Donate form for `/creator/[handle]/donate`. The Donor:
 *   1. Connects a Stellar wallet.
 *   2. Picks a token from the on-chain allowlist (returned by prepare).
 *   3. Enters an amount in display units (converted to raw i128 via decimals).
 *   4. Optionally adds a message and display name.
 *   5. Submits: prepare -> build + sign + submit `donate()` -> confirm.
 *
 * Errors from the typed contract enum (Paused, TokenNotAllowed, etc.) are
 * decoded and surfaced with a user-facing message.
 */

type Phase = "idle" | "preparing" | "submitting" | "confirming" | "success" | "error";

interface DonateFormProps {
  handle: string;
}

interface PrepareResponse {
  donation_id: string;
  donation_id_hash: string;
  contract_id: string;
  handle_hash: string;
  token_allowlist: TokenAllowlistEntry[];
}

interface PrepareError {
  error: string;
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

/** Convert a display amount (e.g. "1.5") to a raw i128 string using decimals. */
export function displayToRawAmount(display: string, decimals: number): string {
  const trimmed = display.trim();
  if (!trimmed) return "0";
  // Split into integer and fractional parts.
  const [intPart, fracPart = ""] = trimmed.split(".");
  const padded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const raw = `${intPart}${padded}`.replace(/^0+/, "") || "0";
  return raw;
}

export function DonateForm({ handle }: DonateFormProps) {
  const [walletAddress, setWalletAddress] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [tokens, setTokens] = React.useState<TokenAllowlistEntry[]>([]);
  const [selectedToken, setSelectedToken] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [donorName, setDonorName] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);

  const busy = phase === "preparing" || phase === "submitting" || phase === "confirming";

  // Fetch the token allowlist on mount. The `tokens` table has a public SELECT
  // RLS policy (ADR: the token picker is public, no RPC call per prepare).
  React.useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("tokens")
      .select("contract_address,symbol,name,issuer,decimals,icon_url")
      .then(({ data, error: fetchErr }) => {
        if (!fetchErr && data) {
          setTokens(data as TokenAllowlistEntry[]);
          if (data.length > 0) {
            setSelectedToken((data[0] as TokenAllowlistEntry).contract_address);
          }
        }
      });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await connectWallet();
      const address = await getWalletAddress();
      setWalletAddress(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !selectedToken || !amount) return;
    const token = tokens.find((t) => t.contract_address === selectedToken);
    if (!token) return;
    const rawAmount = displayToRawAmount(amount, token.decimals);
    if (rawAmount === "0" || BigInt(rawAmount) <= BigInt(0)) {
      setError("Amount must be greater than zero.");
      return;
    }

    setPhase("preparing");
    setError(null);
    setTxHash(null);

    try {
      // 1. Prepare: mint donation_id + hash, insert pending row.
      const prepareRes = await fetch("/api/donations/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle,
          token: selectedToken,
          amount: rawAmount,
          message: message || undefined,
          donor_name: donorName || undefined,
        }),
      });
      const prepareBody = (await prepareRes.json()) as PrepareResponse | PrepareError;
      if (!prepareRes.ok) {
        throw new Error(
          `prepare:${(prepareBody as PrepareError).error}` as string,
        );
      }
      const prepared = prepareBody as PrepareResponse;
      setTokens(prepared.token_allowlist);

      // 2. Build + sign + submit donate() on-chain.
      setPhase("submitting");
      const result = await donateOnChain(
        {
          donorAddress: walletAddress,
          handleHash: hexToBuffer(prepared.handle_hash),
          token: selectedToken,
          amount: BigInt(rawAmount),
          donationIdHash: hexToBuffer(prepared.donation_id_hash),
        },
        {
          rpc: getRpc(),
          signWalletTransaction,
          networkPassphrase,
          contractId: prepared.contract_id,
        },
      );
      setTxHash(result.hash);

      // 3. Confirm: verify tx + event, upsert as confirmed.
      setPhase("confirming");
      const confirmRes = await fetch("/api/donations/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tx_hash: result.hash,
          donation_id: prepared.donation_id,
        }),
      });
      if (!confirmRes.ok) {
        const confirmBody = (await confirmRes.json()) as PrepareError;
        throw new Error(`confirm:${confirmBody.error}` as string);
      }

      setPhase("success");
    } catch (e) {
      setPhase("error");
      if (e instanceof DonateError) {
        setError(DONATE_ERROR_MESSAGES[e.code as DonateErrorCode]);
      } else if (e instanceof Error) {
        const m = e.message;
        // Prepare/confirm API errors: "prepare:<code>" / "confirm:<code>"
        if (m.startsWith("prepare:") || m.startsWith("confirm:")) {
          setError(`Server error: ${m.split(":")[1]}`);
        } else {
          setError(m);
        }
      } else {
        setError("An unexpected error occurred.");
      }
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Donate to {handle}
        </h1>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Wallet connect */}
          {walletAddress ? (
            <p className="font-mono text-xs text-muted-foreground">
              Connected: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={handleConnect}
              disabled={connecting}
              className="w-full"
            >
              {connecting ? "Connecting..." : "Connect Wallet"}
            </Button>
          )}

          {/* Token picker */}
          {tokens.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Token
              </span>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                disabled={busy}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              >
                <option value="" disabled>
                  Select a token
                </option>
                {tokens.map((t) => (
                  <option key={t.contract_address} value={t.contract_address}>
                    {t.symbol} ({t.name ?? t.contract_address.slice(0, 8)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Amount */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Amount
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.00"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </label>

          {/* Donor name (optional) */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Name (optional)
            </span>
            <input
              type="text"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              disabled={busy}
              placeholder="Anonymous"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {/* Message (optional) */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Message (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              placeholder="Say something nice..."
              rows={2}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {/* Error display */}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Success display */}
          {phase === "success" && txHash && (
            <p className="text-sm text-muted-foreground">
              Donation confirmed! Tx: {txHash.slice(0, 10)}...
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!walletAddress || !selectedToken || !amount || busy}
            className="w-full"
          >
            {phase === "preparing" && "Preparing..."}
            {phase === "submitting" && "Submitting..."}
            {phase === "confirming" && "Confirming..."}
            {(phase === "idle" || phase === "success" || phase === "error") && "Donate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
