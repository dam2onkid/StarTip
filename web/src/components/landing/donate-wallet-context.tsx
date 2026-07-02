"use client";

import * as React from "react";
import { connectWallet, disconnectWallet } from "@/lib/wallet/kit";

interface DonateWalletContextValue {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
}

const DonateWalletContext = React.createContext<DonateWalletContextValue | null>(
  null,
);

export function DonateWalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);

  const connect = React.useCallback(async () => {
    setConnecting(true);
    try {
      const { address: nextAddress } = await connectWallet();
      setAddress(nextAddress);
      return nextAddress;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = React.useCallback(async () => {
    try {
      await disconnectWallet();
    } finally {
      setAddress(null);
    }
  }, []);

  const value = React.useMemo(
    () => ({ address, connecting, connect, disconnect }),
    [address, connecting, connect, disconnect],
  );

  return (
    <DonateWalletContext.Provider value={value}>
      {children}
    </DonateWalletContext.Provider>
  );
}

export function useDonateWallet() {
  const context = React.useContext(DonateWalletContext);
  if (!context) {
    throw new Error("useDonateWallet must be used within DonateWalletProvider");
  }
  return context;
}
