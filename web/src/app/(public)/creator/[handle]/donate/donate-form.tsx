"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useDonateWallet } from "@/components/landing/donate-wallet-context";
import { signWalletTransaction } from "@/lib/wallet/kit";
import { getRpc, networkPassphrase } from "@/lib/stellar/client";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  donateOnChain,
  DonateError,
  DONATE_ERROR_MESSAGES,
  type DonateErrorCode,
} from "@/lib/donations/donate";
import { donorHasTrustline } from "@/lib/donations/trustline-check";
import { needsTrustline } from "@/lib/donations/trustline";
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
type TokenLoadState = "loading" | "ready" | "empty" | "error";

interface DonateFormProps {
  handle: string;
  displayName?: string;
  avatarUrl?: string | null;
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

/**
 * Convert a display amount (e.g. "1.5") to a raw i128 string using decimals.
 *
 * Re-exported from the shared `lib/stellar/amount` util so the donate form,
 * the dashboard Donation Goal card, and the public Creator profile all use one
 * source of truth for display/raw conversion. The local export is kept so the
 * existing `donate-form.test.tsx` import (`from "./donate-form"`) keeps working.
 */
import { displayToRawAmount } from "@/lib/stellar/amount";
export { displayToRawAmount };

function creatorInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

/** Quick-select amount buttons shown alongside the custom amount field. */
const QUICK_SELECT_AMOUNTS = ["1", "5", "10"] as const;

export function DonateForm({ handle, displayName = handle, avatarUrl = null }: DonateFormProps) {
  const { address: walletAddress } = useDonateWallet();
  const [tokens, setTokens] = React.useState<TokenAllowlistEntry[]>([]);
  const [selectedToken, setSelectedToken] = React.useState<string>("");
  const [tokenLoadState, setTokenLoadState] = React.useState<TokenLoadState>("loading");
  const [amount, setAmount] = React.useState("");
  const [quickSelect, setQuickSelect] = React.useState<string | null>(null);
  const [hasTrustline, setHasTrustline] = React.useState<boolean | null>(null);
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
        if (fetchErr || !data) {
          setTokenLoadState("error");
          return;
        }

        const nextTokens = data as TokenAllowlistEntry[];
        setTokens(nextTokens);
        if (nextTokens.length > 0) {
          setSelectedToken(nextTokens[0].contract_address);
          setTokenLoadState("ready");
        } else {
          setSelectedToken("");
          setTokenLoadState("empty");
        }
      });
  }, []);

  // Check whether the Donor has a trustline to the selected token once the
  // wallet is connected and the token picker is ready. The lookup is skipped
  // (and `hasTrustline` reset to null) when there is no wallet or no selection,
  // so the form never shows stale guidance. `donorHasTrustline` short-circuits
  // to `true` for native XLM and delegates to the E2E seam when present.
  React.useEffect(() => {
    if (!walletAddress || !selectedToken || tokenLoadState !== "ready") {
      setHasTrustline(null);
      return;
    }
    const token = tokens.find((t) => t.contract_address === selectedToken);
    if (!token) {
      setHasTrustline(null);
      return;
    }
    let cancelled = false;
    donorHasTrustline(getRpc(), walletAddress, token).then((result) => {
      if (!cancelled) setHasTrustline(result);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, selectedToken, tokenLoadState, tokens]);

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
      setTokenLoadState(prepared.token_allowlist.length > 0 ? "ready" : "empty");

      // 2. Build + sign + submit donate() on-chain. When the Donor lacks a
      //    trustline to a non-native token, the pipeline prepends a
      //    change_trust op so the Donor signs once.
      setPhase("submitting");
      const needsTrustlineStep = needsTrustline(token, hasTrustline ?? true);
      const result = await donateOnChain(
        {
          donorAddress: walletAddress,
          handleHash: hexToBuffer(prepared.handle_hash),
          token: selectedToken,
          amount: BigInt(rawAmount),
          donationIdHash: hexToBuffer(prepared.donation_id_hash),
          needsTrustline: needsTrustlineStep,
          trustlineToken: needsTrustlineStep ? token : undefined,
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
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-12 rounded-full border border-foreground/10 object-cover"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.04] font-display text-lg font-semibold text-foreground">
              {creatorInitial(displayName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Donating to
            </p>
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight">
              {displayName}
            </h1>
            <p className="truncate font-mono text-xs text-muted-foreground">
              @{handle}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Wallet status */}
          {walletAddress ? (
            <p className="font-mono text-xs text-muted-foreground">
              Connected: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect your wallet from the navbar to donate.
            </p>
          )}

          {/* Token picker */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Token
            </span>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              disabled={busy || tokenLoadState !== "ready"}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            >
              <option value="" disabled>
                {tokenLoadState === "loading" && "Loading tokens..."}
                {tokenLoadState === "empty" && "No donation tokens available"}
                {tokenLoadState === "error" && "Could not load tokens"}
                {tokenLoadState === "ready" && "Select a token"}
              </option>
              {tokens.map((t) => (
                <option key={t.contract_address} value={t.contract_address}>
                  {t.symbol} ({t.name ?? t.contract_address.slice(0, 8)})
                </option>
              ))}
            </select>
          </label>

          {/* Amount */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Amount
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2" role="group" aria-label="Quick select amount">
                {QUICK_SELECT_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={quickSelect === value}
                    onClick={() => {
                      setAmount(value);
                      setQuickSelect(value);
                    }}
                    disabled={busy}
                    className="flex-1 rounded-md border px-3 py-2 text-sm transition-colors"
                    style={
                      quickSelect === value
                        ? {
                            borderColor: "var(--tertiary, #B4FF39)",
                            color: "var(--tertiary, #B4FF39)",
                          }
                        : undefined
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setQuickSelect(null);
                }}
                disabled={busy}
                placeholder="0.00"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          {/* Trustline guidance: shown only when the Donor lacks a trustline to
              a non-native token. `donorHasTrustline` returns `true` for native
              XLM and for an existing trustline, so `false` only occurs for a
              non-native token the Donor does not hold a trustline to. */}
          {selectedToken && hasTrustline === false && (
            <p className="text-sm text-muted-foreground">
              A trustline to this token is required. The next step will add it
              and donate in one transaction.
            </p>
          )}

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
