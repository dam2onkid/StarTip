"use client";

import * as React from "react";
import {
  DonationFlow,
  VerifyError,
  type DonationFlowState,
  type DonationFlowInput,
  type PrepareArgs,
  type PrepareResult,
} from "@/lib/donations/donation-flow";
import { donateOnChain, type DonateArgs } from "@/lib/donations/donate";
import { donorHasTrustline } from "@/lib/donations/trustline-check";
import { getRpc, networkPassphrase, contractId } from "@/lib/stellar/client";
import { signWalletTransaction } from "@/lib/wallet/kit";

/**
 * Prepare adapter. Creates a single-use Effect Intent on the server before the
 * donor signs the on-chain donation. Returns the locked raw amount and the
 * donation preparation identity to thread into verify.
 */
async function prepareDonation({
  handle,
  token,
  amount,
  effectId,
}: PrepareArgs): Promise<PrepareResult> {
  const res = await fetch("/api/donations/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, token, amount, effect_id: effectId }),
  });

  const body = (await res.json()) as { error?: string; donation_prep_id?: string; raw_amount?: string };
  if (!res.ok) {
    return { ok: false, error: body.error ?? "worker_error" };
  }
  if (!body.donation_prep_id || !body.raw_amount) {
    return { ok: false, error: "worker_error" };
  }
  return { ok: true, donationPrepId: body.donation_prep_id, rawAmount: body.raw_amount };
}

/**
 * Default verify adapter. Posts the tx hash + off-chain content to the worker
 * proxy (ADR-0005: verify is the fast path; the indexer reconciles). A non-OK
 * response is converted into a typed `VerifyError` so the `DonationFlow` state
 * machine can map it to a user-facing message.
 */
async function verifyDonation(
  txHash: string,
  message: string,
  donorName: string,
  donationPrepId?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    tx_hash: txHash,
    message: message || undefined,
    donor_name: donorName || undefined,
  };
  if (donationPrepId) {
    payload.donation_prep_id = donationPrepId;
  }
  const res = await fetch("/api/donations/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new VerifyError(body.error ?? "unknown");
  }
}

/**
 * React hook that instantiates a `DonationFlow` state machine with the real
 * on-chain, trustline, and verify adapters. The returned `state` is
 * synchronized with the module, so the UI can render the current phase.
 *
 * The hook is a thin UI seam over the `DonationFlow` module; unit tests for
 * phase logic should target the module directly with fake adapters.
 */
export function useDonationFlow(): {
  state: DonationFlowState;
  start: (input: DonationFlowInput) => Promise<void>;
  reset: () => void;
} {
  const [flow] = React.useState(
    () =>
      new DonationFlow({
        donate: (args: DonateArgs) =>
          donateOnChain(args, {
            rpc: getRpc(),
            signWalletTransaction,
            networkPassphrase,
            contractId,
          }),
        checkTrustline: (walletAddress, token) =>
          donorHasTrustline(getRpc(), walletAddress, token),
        prepare: prepareDonation,
        verify: verifyDonation,
      }),
  );

  const [state, setState] = React.useState<DonationFlowState>(flow.getState());

  React.useEffect(() => {
    return flow.subscribe(setState);
  }, [flow]);

  const start = React.useCallback(
    (input: DonationFlowInput) => flow.start(input),
    [flow],
  );

  const reset = React.useCallback(() => flow.reset(), [flow]);

  return { state, start, reset };
}
