import "server-only";
import * as StellarSdk from "@stellar/stellar-sdk";
import { networkPassphrase } from "@/lib/stellar/client";

/**
 * Cached metadata for a SAC token on the DonationRouter allowlist, mirrored
 * into the `tokens` table by the indexer on `TokenAllowlistUpdated { added =
 * true }`. `issuer` is nullable because some SAC token interfaces do not
 * expose it.
 */
export interface TokenMetadata {
  contractAddress: string;
  symbol: string;
  name: string | null;
  issuer: string | null;
  decimals: number;
}

/**
 * Source account used only to build the read-only simulation transaction
 * envelope. It does not need to exist on-chain: Soroban RPC simulates
 * read-only contract calls without looking up the source account's ledger
 * entry. Using a constant avoids per-call keypair generation.
 */
const SIM_SOURCE_PUBLIC_KEY = "GD4SFEEGT2D4TJA22S47IMF3GH4Y3554G766B2ANNIDSFHHC2D5WBV7V";

type RpcServer = Pick<StellarSdk.rpc.Server, "simulateTransaction">;

/**
 * Simulate a single read-only contract function call and return the decoded
 * return value. Throws if the simulation errors or returns no result.
 */
async function simulateCall(
  rpc: RpcServer,
  contractAddress: string,
  method: string,
): Promise<StellarSdk.xdr.ScVal> {
  const contract = new StellarSdk.Contract(contractAddress);
  const account = new StellarSdk.Account(SIM_SOURCE_PUBLIC_KEY, "0");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate ${method} on ${contractAddress} failed: ${sim.error}`);
  }
  if (!sim.result) {
    throw new Error(`simulate ${method} on ${contractAddress} returned no result`);
  }
  return sim.result.retval;
}

/**
 * Read `symbol()`, `name()`, `decimals()`, and `issuer()` (if available) from
 * a SAC contract via read-only simulation. Called once per token at indexer
 * insert time; subsequent reads come from the `tokens` table. `issuer` is
 * best-effort: if the contract does not expose `issuer()`, it is left null.
 */
export async function readTokenMetadata(
  rpc: RpcServer,
  contractAddress: string,
): Promise<TokenMetadata> {
  const [symbolVal, nameVal, decimalsVal] = await Promise.all([
    simulateCall(rpc, contractAddress, "symbol"),
    simulateCall(rpc, contractAddress, "name"),
    simulateCall(rpc, contractAddress, "decimals"),
  ]);

  const symbol = StellarSdk.scValToNative(symbolVal) as string;
  const name = StellarSdk.scValToNative(nameVal) as string | null;
  const decimals = Number(StellarSdk.scValToNative(decimalsVal));

  let issuer: string | null = null;
  try {
    const issuerVal = await simulateCall(rpc, contractAddress, "issuer");
    issuer = StellarSdk.scValToNative(issuerVal) as string;
  } catch {
    // issuer() is not present on every SAC token interface; leave null.
  }

  return { contractAddress, symbol, name, issuer, decimals };
}
