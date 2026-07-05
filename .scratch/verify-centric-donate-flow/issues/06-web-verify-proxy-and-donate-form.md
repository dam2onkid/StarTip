# 06 - Web: verify proxy route, update donate-form, remove prepare route, refactor shared confirm

Status: ready-for-agent
Role: fullstack

## Task

Update the Next.js web app for the verify-centric flow per ADR-0005. Add the
verify proxy route, update the donate form to call verify instead of
prepare+confirm, remove the prepare route, and refactor the shared confirm
function to the new verify signature.

## Changes

### Refactor `@startip/shared/donations/confirm.ts` -> verify signature

The shared `confirmDonation` function (in `packages/shared/`) changes
signature per ADR-0005:

```ts
// Before (confirm)
interface ConfirmInput {
  tx_hash: string;
  donation_id: string;
}

// After (verify)
interface VerifyInput {
  tx_hash: string;
  message?: string | null;
  donor_name?: string;
}
```

Logic changes:
- Remove `donation_id` parameter and the `sha256(donation_id)` match logic.
- Match existing row by `tx_hash` only (not `donation_id_hash`).
- On insert (no existing row): use `message` and `donor_name` from the input
  body. Run `classifyMessage` at insert time.
- On update (existing `indexed` row): fill `message`/`donor_name` if the
  existing row has NULL/defaults, promote to `confirmed`.
- On update (existing `confirmed` row): idempotent no-op, return 200.
- Remove the `donation_id_hash` from all insert/update payloads.

### Add `apps/web/src/app/api/donations/verify/route.ts`

Thin proxy to the worker:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const workerRes = await fetch(`${env.WORKER_URL}/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WORKER_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const workerBody = await workerRes.json();
  return NextResponse.json(workerBody, { status: workerRes.status });
}
```

### Add `WORKER_URL` and `WORKER_SECRET` to `apps/web/src/lib/env.ts`

```ts
server: {
  // ...existing...
  WORKER_URL: z.string().url(),
  WORKER_SECRET: z.string().min(1),
},
runtimeEnv: {
  // ...existing...
  WORKER_URL: process.env.WORKER_URL,
  WORKER_SECRET: process.env.WORKER_SECRET,
},
```

### Remove `apps/web/src/app/api/donations/prepare/route.ts`

Delete the file. The prepare endpoint no longer exists.

### Remove `apps/web/src/app/api/donations/confirm/route.ts`

Delete the file. The confirm endpoint is replaced by the verify proxy.

### Update `apps/web/src/app/(public)/creator/[handle]/donate/donate-form.tsx`

The `handleSubmit` function changes from prepare -> donate -> confirm to
donate -> verify:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!walletAddress || !selectedToken || !amount) return;
  // ...validation (amount > 0, etc.)...

  setPhase("submitting");
  setError(null);
  setTxHash(null);

  try {
    // 1. Build + sign + submit donate() on-chain.
    //    handle_hash = sha256(handle), contract_id from env, no donation_id_hash.
    //    Use the existing browser-safe helper (StellarSdk.hash under the
    //    hood) instead of node:crypto — see @/lib/creators/handle-shared.
    const handleHash = handleHashBuffer(handle); // Buffer
    const result = await donateOnChain(
      {
        donorAddress: walletAddress,
        handleHash,
        token: selectedToken,
        amount: BigInt(rawAmount),
        // donationIdHash removed per ADR-0005
      },
      { rpc: getRpc(), signWalletTransaction, networkPassphrase, contractId },
    );
    setTxHash(result.hash);

    // 2. Verify: post txHash + off-chain content to server.
    setPhase("confirming");
    const verifyRes = await fetch("/api/donations/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tx_hash: result.hash,
        message: message || undefined,
        donor_name: donorName || undefined,
      }),
    });
    if (!verifyRes.ok) {
      const verifyBody = await verifyRes.json();
      throw new Error(`verify:${verifyBody.error}`);
    }

    // 3. Optional: subscribe Supabase Realtime for slow path (202).
    //    If verify returned 202, the row will appear via indexer.
    //    For 200, show success immediately.
    setPhase("success");
  } catch (e) {
    setPhase("error");
    // ...error handling...
  }
}
```

Key changes:
- Remove the `fetch("/api/donations/prepare", ...)` block.
- Remove `prepared.donation_id_hash` from `donateOnChain` args.
- Compute `handleHash` locally via `handleHashBuffer(handle)` from
  `@/lib/creators/handle-shared` (no server round-trip). Do not reach for
  `node:crypto` — that helper already exists and is browser-safe.
- Replace `fetch("/api/donations/confirm", ...)` with
  `fetch("/api/donations/verify", ...)`.
- Body: `{ tx_hash, message, donor_name }` (no `donation_id`).
- The `PrepareResponse` / `PrepareError` types are renamed to
  `VerifyResponse` / `VerifyError` or inlined.

### Update `apps/web/src/lib/donations/donate.ts`

Remove `donationIdHash` from `DonateArgs`:

```ts
// Before
interface DonateArgs {
  donorAddress: string;
  handleHash: Buffer;
  token: string;
  amount: bigint;
  donationIdHash: Buffer;  // remove
}

// After
interface DonateArgs {
  donorAddress: string;
  handleHash: Buffer;
  token: string;
  amount: bigint;
}
```

Update the `contract.call("donate", ...)` invocation: remove the
`StellarSdk.xdr.ScVal.scvBytes(donationIdHash)` argument. The contract now
takes 4 args: donor, creator_id_hash, token, amount.

### Remove `apps/web/src/lib/donations/prepare.ts` + test

Delete `prepare.ts` and `prepare.test.ts`. The prepare logic is gone.

### Update `apps/web/src/lib/indexer/dispatch.ts` (in shared after issue 04)

In `dispatchDonationReceived`:
- Remove `donationIdHash` extraction and the match-by-`donation_id_hash`
  block (lines 118-130).
- Match by `tx_hash` only (the existing fallback at lines 133-140 becomes
  the primary path).
- Insert: remove `donation_id_hash` from the insert payload.

### Update `apps/web/src/app/api/indexer/poll/route.ts`

This route stays (for manual trigger / debug), but its import path changes
to `@startip/shared/indexer/dispatch` (issue 04). The indexer loop in the
worker (issue 05) is the primary driver; this route becomes a debug/admin
endpoint.

## Verification

- `turbo run typecheck` passes.
- `turbo run test` passes: updated `confirm.test.ts` (now `verify.test.ts`
  or renamed), `dispatch.test.ts`, `donate.test.ts` with new signatures.
- `apps/web/` dev server boots, donate page loads.
- Manual: donate flow posts to `/api/donations/verify`, proxy forwards to
  worker, worker returns response.

## Dependencies

- Issue 04 (shared package) must land first.
- Issue 05 (worker) must be running for the proxy to have a target.
- Issue 01 (contract change) must land so `donate()` signature matches.

## Comments

- Review (2026-07-05): the original pseudocode called an undefined
  `sha256(handle)` for the client-side handle hash. Fixed to reference the
  existing `handleHashBuffer` / `handleHashHex` helpers in
  `@/lib/creators/handle-shared.ts`, which were already built to be
  browser-safe (`StellarSdk.hash`, byte-identical to `node:crypto`'s
  sha256) for this exact purpose in the onboarding register flow. Tightly
  coupled to issue 05 (worker calls the same refactored `confirm.ts` ->
  `verify` function) — recommend landing together. Triaged `ready-for-agent`.
