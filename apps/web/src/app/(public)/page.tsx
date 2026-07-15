import type { Metadata } from "next";
import { LenisProvider } from "@/components/landing/lenis-provider";
import { LandingShell } from "@/components/landing/landing-shell";
import { createServerClient } from "@/lib/supabase/server";
import { resolveNavAuth, type NavAuth } from "@/lib/nav/auth";

export const metadata: Metadata = {
  title: "StarTip — Global tips for livestream creators",
  description:
    "Accept tips from anywhere in seconds. StarTip gives creators a public donation page, an OBS overlay, and on-chain proof for every tip.",
  openGraph: {
    title: "StarTip — Global tips for livestream creators",
    description:
      "Accept tips from anywhere in seconds. StarTip gives creators a public donation page, an OBS overlay, and on-chain proof for every tip.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StarTip — Global tips for livestream creators",
    description:
      "Accept tips from anywhere in seconds. StarTip gives creators a public donation page, an OBS overlay, and on-chain proof for every tip.",
  },
};

export default async function LandingPage() {
  const supabase = await createServerClient();
  const auth: NavAuth = await resolveNavAuth(supabase);
  return (
    <LenisProvider>
      <LandingShell auth={auth} />
    </LenisProvider>
  );
}
