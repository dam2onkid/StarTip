"use client";

import * as React from "react";
import { toast } from "sonner";
import { Wallet, ArrowRightLeft, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Select as SelectPrimitive } from "radix-ui";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { useDonateWallet } from "@/components/landing/donate-wallet-context";
import { useDonationFlow } from "@/lib/donations/use-donation-flow";
import { useTokenAllowlist } from "@/lib/donations/use-token-allowlist";
import { useTrustline } from "@/lib/donations/use-trustline";
import { displayToRawAmount } from "@/lib/stellar/amount";
import { cn } from "@/lib/utils";

export { displayToRawAmount };

interface DonateFormProps {
  handle: string;
  displayName?: string;
  avatarUrl?: string | null;
  donorDisplayName?: string;
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

function TokenIcon({
  src,
  symbol,
  className,
}: {
  src?: string | null;
  symbol: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={symbol}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary/10 font-mono text-[0.6rem] font-semibold text-primary uppercase",
        className,
      )}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

function WalletBadge({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
        <Wallet className="size-4 text-primary" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          Connected wallet
        </p>
        <p className="truncate font-mono text-sm text-foreground">
          {address.slice(0, 8)}...{address.slice(-6)}
        </p>
      </div>
    </div>
  );
}

function ConnectWalletPrompt({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-foreground/10 bg-foreground/[0.02] p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Wallet className="size-7 text-primary" aria-hidden />
      </div>
      <div>
        <p className="font-display text-lg font-semibold">Connect your wallet</p>
        <p className="text-sm text-muted-foreground">
          Link a Stellar wallet to send your donation.
        </p>
      </div>
      <Button
        type="button"
        onClick={() => void onConnect()}
        disabled={connecting}
        className="w-full sm:w-auto"
      >
        {connecting ? "Connecting..." : "Connect wallet"}
      </Button>
    </div>
  );
}

export function DonateForm({
  handle,
  displayName = handle,
  avatarUrl = null,
  donorDisplayName,
}: DonateFormProps) {
  const { address: walletAddress, connect, connecting: connectingWallet } = useDonateWallet();
  const { state, start } = useDonationFlow();
  const { tokens, status: tokenLoadState } = useTokenAllowlist();

  const [selectedToken, setSelectedToken] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [quickSelect, setQuickSelect] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [donorName, setDonorName] = React.useState(donorDisplayName ?? "");

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

  const canSubmit =
    walletAddress && effectiveSelectedToken && amount && !busy;

  const buttonLabel =
    state.phase === "submitting"
      ? "Submitting..."
      : state.phase === "confirming"
        ? "Confirming..."
        : "Donate";

  return (
    <Card className="glass-strong mx-auto w-full max-w-2xl rounded-[var(--radius-xl)] border border-foreground/10 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)]">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-20 rounded-full border border-primary/20 object-cover shadow-[0_0_24px_-6px_rgba(180,255,57,0.25)]"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-display text-2xl font-semibold text-primary shadow-[0_0_24px_-6px_rgba(180,255,57,0.25)]">
              {creatorInitial(displayName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Donating to
            </p>
            <h1 className="truncate font-display text-3xl font-semibold tracking-tight">
              {displayName}
            </h1>
            <p className="truncate font-mono text-sm text-muted-foreground">
              @{handle}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {walletAddress ? (
          <WalletBadge address={walletAddress} />
        ) : (
          <ConnectWalletPrompt
            onConnect={connect}
            connecting={connectingWallet}
          />
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="donate-token" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Token
              </FieldLabel>
              <Select
                value={effectiveSelectedToken}
                onValueChange={setSelectedToken}
                disabled={busy || tokenLoadState !== "ready"}
              >
                <SelectTrigger id="donate-token" className="h-12 border-foreground/10 bg-foreground/[0.03] text-base transition-colors hover:bg-foreground/[0.06]">
                  <SelectValue
                    placeholder={
                      tokenLoadState === "loading"
                        ? "Loading tokens..."
                        : tokenLoadState === "empty"
                          ? "No donation tokens available"
                          : tokenLoadState === "error"
                            ? "Could not load tokens"
                            : "Select a token"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="border-foreground/10 bg-card/95 backdrop-blur-md">
                  {tokens.map((t) => (
                    <SelectPrimitive.Item
                      key={t.contract_address}
                      value={t.contract_address}
                      textValue={t.symbol}
                      className="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                    >
                      <span className="absolute right-2 flex size-3.5 items-center justify-center">
                        <SelectPrimitive.ItemIndicator>
                          <CheckIcon className="size-4" />
                        </SelectPrimitive.ItemIndicator>
                      </span>
                      <span className="flex items-center gap-2">
                        <TokenIcon
                          src={t.icon_url}
                          symbol={t.symbol}
                          className="size-5"
                        />
                        <SelectPrimitive.ItemText>
                          <span className="font-medium">{t.symbol}</span>
                        </SelectPrimitive.ItemText>
                        <span className="text-muted-foreground">
                          {t.name ?? t.contract_address.slice(0, 8)}
                        </span>
                      </span>
                    </SelectPrimitive.Item>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Choose the token you want to donate.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="donate-amount" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Amount
              </FieldLabel>
              <div className="flex flex-col gap-3">
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
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-all",
                        quickSelect === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-foreground/10 bg-foreground/[0.03] text-foreground hover:border-foreground/20 hover:bg-foreground/[0.06]",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Input
                    id="donate-amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setQuickSelect(null);
                    }}
                    disabled={busy}
                    placeholder="0.00"
                    className="h-12 pr-16 text-lg font-medium"
                    required
                  />
                  {selectedTokenEntry && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                      {selectedTokenEntry.symbol}
                    </span>
                  )}
                </div>
              </div>
            </Field>

            <div
              className={cn(
                "grid grid-cols-1 gap-6",
                !donorDisplayName && "md:grid-cols-2",
              )}
            >
              {!donorDisplayName && (
                <Field>
                  <FieldLabel htmlFor="donate-name" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Name (optional)
                  </FieldLabel>
                  <Input
                    id="donate-name"
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    disabled={busy}
                    placeholder="Anonymous"
                    className="h-12 border-foreground/10 bg-foreground/[0.03] text-base transition-colors hover:bg-foreground/[0.06]"
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="donate-message" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Message (optional)
                </FieldLabel>
                <Textarea
                  id="donate-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                  placeholder="Say something nice..."
                  rows={2}
                  className="min-h-[3rem] resize-none border-foreground/10 bg-foreground/[0.03] text-base transition-colors hover:bg-foreground/[0.06]"
                />
              </Field>
            </div>
          </FieldGroup>

          {effectiveSelectedToken && hasTrustline === false && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              <ArrowRightLeft className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                A trustline to this token is required. The next step will add it
                and donate in one transaction.
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            loading={busy}
            size="lg"
            className="h-12 w-full text-base font-semibold transition-all hover:shadow-[0_0_32px_-8px_rgba(180,255,57,0.5)]"
          >
            {buttonLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
