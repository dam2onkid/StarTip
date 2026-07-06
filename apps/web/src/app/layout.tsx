import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/landing/site-nav";
import { Toaster } from "@/components/ui/sonner";
import { createServerClient } from "@/lib/supabase/server";
import { resolveNavAuth } from "@/lib/nav/auth";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-label",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "StarTip",
    template: "StarTip — %s",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1013",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the Supabase session server-side so the nav's right cluster is
  // auth-aware on first render (PRD: Unified hybrid navigation, issue 03).
  // `resolveNavAuth` reads the caller's Profile (display_name, avatar_url)
  // via the RLS-bearing server client and returns a serializable `NavAuth`
  // prop. The nav suppresses itself on /overlay/* (OBS browser source) via
  // the current pathname, keeping that surface transparent and chrome-free.
  const supabase = await createServerClient();
  const auth = await resolveNavAuth(supabase);
  return (
    <html
      lang="en"
      className={`dark ${interTight.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <SiteNav auth={auth} />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
