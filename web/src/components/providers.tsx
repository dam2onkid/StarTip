import * as React from "react";
import { DonateWalletProvider } from "@/components/landing/donate-wallet-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <DonateWalletProvider>{children}</DonateWalletProvider>;
}
