import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServiceClient } from "@startip/shared/supabase/service";
import { DonateForm } from "./donate-form";

interface DonateCreatorIdentity {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * `/creator/[handle]/donate` — public donate form. The Donor connects a
 * Stellar wallet, picks a token from the on-chain allowlist, enters an
 * amount + optional message, and signs + submits `donate()` directly to
 * Soroban RPC. See `donate-form.tsx` for the full flow.
 *
 * `params` is a Promise in Next.js 15; the route awaits it server-side and
 * loads the public Creator identity before rendering the client form.
 */
export default async function DonatePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const normalized = handle.trim().toLowerCase();

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("handle,display_name,avatar_url,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();

  const p = profile as {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    onchain_registered: boolean;
    paused: boolean;
  } | null;

  if (!p || !p.onchain_registered || p.paused) {
    notFound();
  }

  return (
    <DonatePageShell
      creator={{
        handle: p.handle,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
      }}
    />
  );
}

export function DonatePageShell({ creator }: { creator: DonateCreatorIdentity }) {
  const creatorHref = `/creator/${encodeURIComponent(creator.handle)}`;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-32 pb-24">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="w-fit border border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
      >
        <Link href={creatorHref} aria-label={`Back to ${creator.handle} creator page`}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to creator
        </Link>
      </Button>
      <DonateForm
        handle={creator.handle}
        displayName={creator.displayName}
        avatarUrl={creator.avatarUrl}
      />
    </section>
  );
}
