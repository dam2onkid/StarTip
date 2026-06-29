import { networkPassphrase } from "@/lib/stellar/client";

/**
 * Thin wrapper around the Stellar Wallets Kit (V2 static API). The kit is
 * initialized once with `defaultModules()` and Freighter as the primary
 * (selected) wallet, matching ADR-0002.
 *
 * Test seam: when `window.__STARTIP_WALLET_STUB__` is present (injected by the
 * Playwright E2E harness), every call delegates to the stub and the real kit
 * is never imported. This keeps the heavy browser-only kit out of jsdom unit
 * tests and lets E2E drive the onboarding flow with a deterministic wallet.
 */

export interface WalletStub {
  address: string;
  connect(): Promise<{ address: string }>;
  signMessage(message: string): Promise<{ signedMessage: string; signerAddress?: string }>;
  signTransaction(xdr: string): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  disconnect?(): Promise<void>;
}

declare global {
  interface Window {
    __STARTIP_WALLET_STUB__?: WalletStub;
  }
}

/** Result shape shared by the kit and the stub for `signMessage`. */
export interface SignMessageResult {
  signedMessage: string;
  signerAddress?: string;
}

/** Result shape shared by the kit and the stub for `signTransaction`. */
export interface SignTransactionResult {
  signedTxXdr: string;
  signerAddress?: string;
}

let initialized = false;

function stub(): WalletStub | undefined {
  if (typeof window !== "undefined") return window.__STARTIP_WALLET_STUB__;
  return undefined;
}

/**
 * Lazily import and initialize the real kit. Only reached when no test stub is
 * installed. `init` is idempotent across calls but the kit does not re-init
 * cleanly, so we guard with a module flag.
 */
async function ensureInit(): Promise<void> {
  if (initialized) return;
  const [{ StellarWalletsKit }, { defaultModules }, { FREIGHTER_ID }, { Networks }] =
    await Promise.all([
      import("@creit-tech/stellar-wallets-kit/sdk"),
      import("@creit-tech/stellar-wallets-kit/modules/utils"),
      import("@creit-tech/stellar-wallets-kit/modules/freighter"),
      import("@creit-tech/stellar-wallets-kit/types"),
    ]);
  StellarWalletsKit.init({
    modules: defaultModules(),
    selectedWalletId: FREIGHTER_ID,
    network:
      networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET,
  });
  initialized = true;
}

async function kit() {
  await ensureInit();
  const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit/sdk");
  return StellarWalletsKit;
}

/** Open the wallet picker modal and return the connected address. */
export async function connectWallet(): Promise<{ address: string }> {
  const s = stub();
  if (s) return s.connect();
  const K = await kit();
  return K.authModal();
}

/** Return the currently active wallet address. */
export async function getWalletAddress(): Promise<string> {
  const s = stub();
  if (s) return s.address;
  const K = await kit();
  const { address } = await K.getAddress();
  return address;
}

/**
 * Sign a human-readable challenge message. The network passphrase and active
 * address are passed so the wallet binds the signature to the right network.
 *
 * The kit returns the signature as a base64 string (Freighter) or whatever the
 * active module produces. We normalize to lowercase hex so the server's
 * `Buffer.from(signedMessage, "hex")` decode in `POST /api/wallet/link` is
 * wire-format-stable across wallets. Test stubs that already return hex pass
 * through unchanged.
 */
export async function signWalletMessage(message: string): Promise<SignMessageResult> {
  const s = stub();
  if (s) return normalizeSignatureHex(s.signMessage(message));
  const K = await kit();
  const { address } = await K.getAddress();
  return normalizeSignatureHex(K.signMessage(message, { networkPassphrase, address }));
}

/**
 * Coerce a kit `signMessage` result to `{ signedMessage: <hex>, signerAddress? }`.
 * Accepts hex, base64, or a Buffer/Uint8Array-like value. Hex is detected by
 * charset + even length; everything else is treated as base64.
 */
async function normalizeSignatureHex(
  p: Promise<SignMessageResult> | SignMessageResult,
): Promise<SignMessageResult> {
  const res = await p;
  const hex = toHex(res.signedMessage);
  return { signedMessage: hex, signerAddress: res.signerAddress };
}

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

function toHex(signedMessage: string): string {
  if (typeof signedMessage !== "string") {
    // Defensive: some modules may return a Uint8Array under the typed string.
    return Buffer.from(signedMessage as unknown as Uint8Array).toString("hex");
  }
  if (isHex(signedMessage)) return signedMessage.toLowerCase();
  // base64 fallback (Freighter's default wire format).
  return Buffer.from(signedMessage, "base64").toString("hex");
}

/** Sign a built transaction XDR. */
export async function signWalletTransaction(xdr: string): Promise<SignTransactionResult> {
  const s = stub();
  if (s) return s.signTransaction(xdr);
  const K = await kit();
  const { address } = await K.getAddress();
  return K.signTransaction(xdr, { networkPassphrase, address });
}

/** Disconnect the active wallet. */
export async function disconnectWallet(): Promise<void> {
  const s = stub();
  if (s) {
    await s.disconnect?.();
    return;
  }
  const K = await kit();
  await K.disconnect();
  initialized = false;
}

/**
 * Classify a `signMessage` failure. WalletConnect-style wallets cannot sign
 * arbitrary messages (ADR-0002): the kit surfaces that as an error whose
 * message references `signMessage` not being supported. The UI uses this to
 * show the "reconnect with a message-signing wallet like Freighter" guidance.
 */
export function classifySignMessageError(err: unknown): "unsupported" | "unknown" {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = message.toLowerCase();
  if (lower.includes("signmessage") && lower.includes("not")) return "unsupported";
  if (lower.includes("does not support") && lower.includes("signmessage"))
    return "unsupported";
  if (lower.includes("not implemented") && lower.includes("signmessage"))
    return "unsupported";
  return "unknown";
}
