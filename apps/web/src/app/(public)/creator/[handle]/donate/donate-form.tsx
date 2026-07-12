"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useDonateWallet } from "@/components/landing/donate-wallet-context";
import { useDonationFlow } from "@/lib/donations/use-donation-flow";
import { useTokenAllowlist } from "@/lib/donations/use-token-allowlist";
import { useTrustline } from "@/lib/donations/use-trustline";
import { displayToRawAmount } from "@/lib/stellar/amount";

export { displayToRawAmount };

interface DonateFormProps {
  handle: string;
  displayName?: string;
  avatarUrl?: string | null;
}

function creatorInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

/** Quick-select amount buttons shown alongside the custom amount field. */
const QUICK_SELECT_AMOUNTS = ["1", "5", "10"] as const;

/** Path to the bundled success sound in /public (shared with the overlay). */
const SUCCESS_SOUND_URL = "/alert.mp3";

function playDonateSuccessSound(): void {
  if (typeof Audio === "undefined") return;
  try {
    const audio = new Audio(SUCCESS_SOUND_URL);
    audio.volume = 0.8;
    void audio.play().catch(() => {
      // Autoplay blocked or decode error: silent. The success UI still shows.
    });
  } catch {
    // `new Audio` or `play` threw: silent.
  }
}

export function DonateForm({
  handle,
  displayName = handle,
  avatarUrl = null,
}: DonateFormProps) {
  const { address: walletAddress } = useDonateWallet();
  const { state, start } = useDonationFlow();
  const { tokens, status: tokenLoadState } = useTokenAllowlist();

  const [selectedToken, setSelectedToken] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [quickSelect, setQuickSelect] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [donorName, setDonorName] = React.useState("");

  const effectiveSelectedToken =
    selectedToken && tokens.some((t) => t.contract_address === selectedToken)
      ? selectedToken
      : tokens[0]?.contract_address ?? "";

  const selectedTokenEntry =
    tokens.find((t) => t.contract_address === effectiveSelectedToken) ?? null;
  const hasTrustline = useTrustline(walletAddress, selectedTokenEntry);

  const busy = state.phase === "submitting" || state.phase === "confirming";

  const playedSuccessSound = React.useRef(false);
  React.useEffect(() => {
    if (state.phase === "success" && !playedSuccessSound.current) {
      playedSuccessSound.current = true;
      playDonateSuccessSound();
    }
    if (state.phase !== "success") {
      playedSuccessSound.current = false;
    }
  }, [state.phase]);

  const prevPhase = React.useRef(state.phase);
  React.useEffect(() => {
    if (state.phase === "success" && prevPhase.current !== "success") {
      toast.success("Donation confirmed!", {
        description: `Sent to ${displayName}. Tx: ${state.txHash?.slice(0, 10)}...`,
      });
    } else if (state.phase === "error" && prevPhase.current !== "error") {
      toast.error("Donation failed", { description: state.error });
    }
    prevPhase.current = state.phase;
  }, [state.phase, state.error, state.txHash, displayName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !effectiveSelectedToken || !amount) return;
    const token = tokens.find(
      (t) => t.contract_address === effectiveSelectedToken,
    );
    if (!token) return;

    await start({
      handle,
      walletAddress,
      token,
      amount,
      message,
      donorName,
    });
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
          {walletAddress ? (
            <p className="font-mono text-xs text-muted-foreground">
              Connected: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect your wallet from the navbar to donate.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Token
            </span>
            <select
              value={effectiveSelectedToken}
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

          {effectiveSelectedToken && hasTrustline === false && (
            <p className="text-sm text-muted-foreground">
              A trustline to this token is required. The next step will add it
              and donate in one transaction.
            </p>
          )}

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

          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          {state.phase === "success" && state.txHash && (
            <p className="text-sm text-muted-foreground">
              Donation confirmed! Tx: {state.txHash.slice(0, 10)}...
            </p>
          )}

          <Button
            type="submit"
            disabled={!walletAddress || !effectiveSelectedToken || !amount || busy}
            className="w-full"
          >
            {state.phase === "submitting" && "Submitting..."}
            {state.phase === "confirming" && "Confirming..."}
            {(state.phase === "idle" ||
              state.phase === "success" ||
              state.phase === "error") &&
              "Donate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
