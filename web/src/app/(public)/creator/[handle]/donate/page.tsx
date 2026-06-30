import * as React from "react";
import { DonateForm } from "./donate-form";

/**
 * `/creator/[handle]/donate` — public donate form. The Donor connects a
 * Stellar wallet, picks a token from the on-chain allowlist, enters an
 * amount + optional message, and signs + submits `donate()` directly to
 * Soroban RPC. See `donate-form.tsx` for the full flow.
 *
 * `params` is a Promise in Next.js 15; `React.use` unwraps it synchronously
 * during render so the page stays a sync component (testable with
 * `@testing-library/react`'s `render`).
 */
export default function DonatePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = React.use(params);
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 pt-32 pb-24">
      <DonateForm handle={handle} />
    </section>
  );
}
