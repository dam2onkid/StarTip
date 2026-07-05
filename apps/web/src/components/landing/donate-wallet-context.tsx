"use client";

import * as React from "react";
import { connectWallet, disconnectWallet } from "@/lib/wallet/kit";

/**
 * Shared Donate Wallet state (PRD: Unified hybrid navigation, issue 02).
 *
 * A single React context that backs the nav's `DonateWalletConnector` and any
 * surface that needs the connected browser wallet (today: the donate form).
 * Holding the address in one place fixes the previous bug where the navbar
 * connector and the donate form each kept their own `walletAddress` state, so
 * the two "Connect wallet" buttons could disagree.
 *
 * The context only tracks the browser wallet connected via the Stellar Wallets
 * Kit (`lib/wallet/kit.ts`). It never reads or writes `profiles.owner_address`
 * and never requires login. Connect/disconnect are exposed as stable callbacks
 * so the connector stays the single UI entry point for wallet actions.
 */

interface DonateWalletContextValue {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const DonateWalletContext =
  React.createContext<DonateWalletContextValue | null>(null);

export function DonateWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);

  const connect = React.useCallback(async () => {
    setConnecting(true);
    try {
      const { address: addr } = await connectWallet();
      setAddress(addr);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = React.useCallback(async () => {
    try {
      await disconnectWallet();
    } catch {
      // Even if the kit disconnect fails, drop the local address so consumers
      // revert to the disconnected state. The next connect re-initializes.
    }
    setAddress(null);
  }, []);

  const value = React.useMemo<DonateWalletContextValue>(
    () => ({ address, connecting, connect, disconnect }),
    [address, connecting, connect, disconnect],
  );

  return (
    <DonateWalletContext.Provider value={value}>
      {children}
    </DonateWalletContext.Provider>
  );
}

/**
 * Read the shared Donate Wallet state. Must be used inside
 * `DonateWalletProvider`; throws otherwise so wiring mistakes fail fast.
 */
export function useDonateWallet(): DonateWalletContextValue {
  const ctx = React.useContext(DonateWalletContext);
  if (!ctx) {
    throw new Error("useDonateWallet must be used within DonateWalletProvider");
  }
  return ctx;
}
