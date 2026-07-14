import type { Metadata } from "next";
import { DocsContent } from "./docs-shell";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Learn how StarTip works, how to set up your creator page, how to donate, and find answers to common questions.",
  openGraph: {
    title: "StarTip Docs",
    description:
      "Learn how StarTip works, how to set up your creator page, how to donate, and find answers to common questions.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StarTip Docs",
    description:
      "Learn how StarTip works, how to set up your creator page, how to donate, and find answers to common questions.",
  },
};

export default function DocsPage() {
  return <DocsContent />;
}
