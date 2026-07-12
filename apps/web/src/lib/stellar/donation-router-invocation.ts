import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Network-dependent dependencies for a DonationRouter contract invocation.
 */
export interface NetworkConfig {
  /** Soroban RPC server used to load accounts, simulate, and submit. */
  rpc: StellarSdk.rpc.Server;
  /** DonationRouter contract id (C... strkey). */
  contractId: string;
  /** Network passphrase for transaction building and XDR parsing. */
  networkPassphrase: string;
}

/**
 * The party that signs the assembled transaction. `address` is both the source
 * account used to load the sequence and the expected signer. The returned
 * `signerAddress` is checked against it so the UI can detect a wallet switch.
 */
export interface Signer {
  address: string;
  signTransaction(txXdr: string): Promise<{
    signedTxXdr: string;
    signerAddress?: string;
  }>;
}

/**
 * Inputs to `invokeDonationRouter`.
 */
export interface InvokeDonationRouterArgs {
  /** Contract function name to invoke. */
  method: string;
  /** `ScVal` arguments for the contract function. */
  args: StellarSdk.xdr.ScVal[];
  /**
   * Optional classic Stellar operations to prepend before the Soroban
   * invocation. Used by the two-op `change_trust` + `donate()` path.
   */
  preOperations?: StellarSdk.xdr.Operation[];
  /** Wallet that will sign the transaction. */
  signer: Signer;
  /** Network configuration (RPC, contract, network passphrase). */
  networkConfig: NetworkConfig;
}

/**
 * Result of a successful on-chain submission.
 */
export interface InvokeDonationRouterResult {
  status: string;
  hash: string;
}

/**
 * Build, simulate, assemble, sign, and submit a DonationRouter contract
 * invocation. This is the single public seam for all on-chain creator and
 * donation actions that call the router.
 *
 * 1. Load the source account from RPC.
 * 2. Build a transaction with the contract invocation, optionally preceded by
 *    `preOperations`.
 * 3. Simulate the transaction to attach Soroban auth and resources.
 * 4. Assemble the transaction. For single-op Soroban calls, use the SDK's
 *    `assembleTransaction`. For multi-op calls (e.g. `change_trust` + `donate()`),
 *    re-build from the simulation data manually because the SDK assembler only
 *    supports one Soroban operation per transaction.
 * 5. Sign the assembled XDR and verify the returned signer address.
 * 6. Submit the signed transaction and return the result.
 */
export async function invokeDonationRouter(
  args: InvokeDonationRouterArgs,
): Promise<InvokeDonationRouterResult> {
  const { method, args: contractArgs, preOperations = [], signer, networkConfig } = args;
  const { rpc, contractId, networkPassphrase } = networkConfig;

  const account = await rpc.getAccount(signer.address);
  const contract = new StellarSdk.Contract(contractId);
  const invokeOp = contract.call(method, ...contractArgs);

  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  });
  for (const op of preOperations) {
    builder.addOperation(op);
  }
  const tx = builder.addOperation(invokeOp).setTimeout(30).build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate ${method} failed: ${sim.error}`);
  }

  const prepared =
    preOperations.length === 0
      ? StellarSdk.rpc.assembleTransaction(tx, sim).build()
      : assembleMultiOpTransaction(tx, sim, networkPassphrase);

  const { signedTxXdr, signerAddress } = await signer.signTransaction(prepared.toXDR());
  if (signerAddress && signerAddress !== signer.address) {
    throw new Error(`signerAddress mismatch: expected ${signer.address}, got ${signerAddress}`);
  }

  const signed = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
  const sent = await rpc.sendTransaction(signed);
  if (sent.status === "ERROR") {
    const detail = sent.errorResult ? sent.errorResult.result().toString() : "unknown";
    throw new Error(`${method} failed: ${sent.status} ${detail}`);
  }
  return { status: sent.status, hash: sent.hash };
}

/**
 * Assemble a transaction that contains one or more classic pre-operations plus
 * a single `invokeHostFunction` Soroban operation. The SDK's `assembleTransaction`
 * rejects any Soroban transaction with more than one operation, so this helper
 * clones the raw transaction, attaches the simulated `sorobanData`, then re-adds
 * every operation, attaching the simulated auth entries to the invoke op.
 */
function assembleMultiOpTransaction(
  raw: StellarSdk.Transaction,
  simulation: StellarSdk.rpc.Api.SimulateTransactionResponse,
  networkPassphrase: string,
): StellarSdk.Transaction {
  const success = StellarSdk.rpc.parseRawSimulation(simulation);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(success)) {
    throw new Error(`simulation incorrect: ${JSON.stringify(success)}`);
  }

  const txnBuilder = StellarSdk.TransactionBuilder.cloneFrom(raw, {
    sorobanData: success.transactionData.build(),
    networkPassphrase,
  });

  txnBuilder.clearOperations();
  for (const op of raw.tx.operations()) {
    if (op.body().switch().name === "invokeHostFunction") {
      const ihf = op.body().invokeHostFunctionOp();
      const existingAuth = ihf.auth() ?? [];
      const sourceAccount = op.sourceAccount();
      txnBuilder.addOperation(
        StellarSdk.Operation.invokeHostFunction({
          source: sourceAccount
            ? StellarSdk.encodeMuxedAccountToAddress(sourceAccount)
            : undefined,
          func: ihf.hostFunction(),
          auth: existingAuth.length > 0 ? existingAuth : (success.result?.auth ?? []),
        }),
      );
    } else {
      txnBuilder.addOperation(op);
    }
  }

  return txnBuilder.build();
}
