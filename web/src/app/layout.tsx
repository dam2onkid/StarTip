import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/landing/site-nav";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${interTight.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {/* Unified nav: rendered once at the root so every route inherits it.
            SiteNav suppresses itself on /overlay/* (OBS browser source) via the
            current pathname, keeping that surface transparent and chrome-free. */}
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
