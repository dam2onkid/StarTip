import { displayToRawAmount } from "@/lib/stellar/amount";
import { handleHashBuffer } from "@/lib/creators/handle-shared";
import { friendlyOnchainError } from "@/lib/stellar/contract-errors";
import { needsTrustline, type TrustlineToken } from "@/lib/donations/trustline";
import {
  DonateError,
  DONATE_ERROR_MESSAGES,
  type DonateArgs,
  type DonateErrorCode,
  type DonateResult,
} from "@/lib/donations/donate";
import type { TokenAllowlistEntry } from "@/lib/donations/token";

/**
 * Error thrown when the server-side prepare step (Effect Intent creation) fails.
 * The `code` is the worker/public API error name so the UI can show a tailored
 * message without exposing internal details.
 */
export class PrepareError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Prepare failed: ${code}`);
    this.name = "PrepareError";
    this.code = code;
  }
}

export interface PrepareArgs {
  handle: string;
  token: string;
  amount: string;
  effectId: string;
}

export interface PrepareSuccess {
  donationPrepId: string;
  rawAmount: string;
}

export type PrepareResult =
  | ({ ok: true } & PrepareSuccess)
  | { ok: false; error: string };

/**
 * DonationFlow state machine. Models the donor's journey on `/donate/[handle]`:
 *
 *   idle -> submitting -> confirming -> success
 *                           |
 *                           +-> error
 *
 * The module exposes a small interface: callers provide input (handle, token,
 * amount, message, donor name) and receive a state object (phase, tx hash,
 * error). It delegates to injected adapters for the three I/O seams:
 * on-chain invocation, trustline checking, and verify polling. Phase
 * transitions and error mapping are centralized here so the UI only renders
 * state.
 */

export type DonationFlowPhase =
  | "idle"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export interface DonationFlowState {
  phase: DonationFlowPhase;
  error: string | null;
  txHash: string | null;
}

export interface DonationFlowInput {
  handle: string;
  walletAddress: string;
  token: TokenAllowlistEntry;
  amount: string;
  message: string;
  donorName: string;
  /** Selected Default Pack effect id (e.g. `jump-scare`). When omitted, the donation settles normally with no effect. */
  effectId?: string;
}

export interface DonationFlowAdapters {
  /** Build, sign, and submit the on-chain `donate()` invocation. */
  donate(args: DonateArgs): Promise<DonateResult>;
  /** Return `true` when the donor already has a trustline to the token. */
  checkTrustline(
    walletAddress: string,
    token: TrustlineToken,
  ): Promise<boolean>;
  /**
   * Create a single-use, expiring Effect Intent before the on-chain donation.
   * Optional: when `input.effectId` is set, the flow calls this before signing.
   */
  prepare?(args: PrepareArgs): Promise<PrepareResult>;
  /** Poll the verify worker until the donation is confirmed. */
  verify(
    txHash: string,
    message: string,
    donorName: string,
    donationPrepId?: string,
  ): Promise<void>;
}

export type DonationFlowListener = (state: DonationFlowState) => void;

/**
 * Error thrown by a verify adapter when the worker proxy reports that the
 * donation could not be confirmed. The `code` is surfaced to the user as
 * `Server error: ${code}`.
 */
export class VerifyError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? `Verify failed: ${code}`);
    this.name = "VerifyError";
    this.code = code;
  }
}

/**
 * Internal validation error for input that fails before any I/O adapter is
 * invoked (e.g. an amount that is not greater than zero).
 */
export class DonationFlowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DonationFlowValidationError";
  }
}

/**
 * Map an error from an adapter to the user-facing message the UI should render.
 */
const PREPARE_ERROR_MESSAGES: Record<string, string> = {
  live_events_disabled: "Live Events are currently disabled for this creator.",
  amount_below_price: "The amount is below the selected effect's minimum price.",
  invalid_effect: "The selected effect is not available.",
  token_not_found: "The selected token is not supported.",
  price_below_floor: "This effect's price is below the platform floor. Please try again later.",
  creator_not_found: "This creator was not found.",
  intent_exists: "This donation is already being prepared. Please try again.",
  worker_error: "Could not prepare the donation. Please try again.",
  db_error: "Could not prepare the donation. Please try again.",
};

function mapDonationFlowError(err: unknown): string {
  if (err instanceof DonateError) {
    return DONATE_ERROR_MESSAGES[err.code] ?? err.message;
  }
  if (err instanceof Error && err.name === "DonateError" && "code" in err) {
    const code = (err as { code: string }).code as DonateErrorCode;
    return DONATE_ERROR_MESSAGES[code] ?? err.message;
  }
  if (err instanceof PrepareError) {
    return PREPARE_ERROR_MESSAGES[err.code] ?? err.message;
  }
  if (err instanceof VerifyError) {
    return `Server error: ${err.code}`;
  }
  if (err instanceof DonationFlowValidationError) {
    return err.message;
  }
  if (err instanceof Error) {
    return friendlyOnchainError(err, "An unexpected error occurred.");
  }
  return "An unexpected error occurred.";
}

export class DonationFlow {
  private state: DonationFlowState = { phase: "idle", error: null, txHash: null };
  private listeners = new Set<DonationFlowListener>();

  constructor(private adapters: DonationFlowAdapters) {}

  getState(): DonationFlowState {
    return this.state;
  }

  subscribe(listener: DonationFlowListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(next: DonationFlowState): void {
    this.state = next;
    this.emit();
  }

  reset(): void {
    this.setState({ phase: "idle", error: null, txHash: null });
  }

  async start(input: DonationFlowInput): Promise<void> {
    this.setState({ phase: "submitting", error: null, txHash: null });

    try {
      let rawBigInt: bigint;
      let donationPrepId: string | undefined;

      if (input.effectId) {
        if (!this.adapters.prepare) {
          throw new Error("Prepare adapter is required when an effect is selected.");
        }
        const prepared = await this.adapters.prepare({
          handle: input.handle,
          token: input.token.contract_address,
          amount: input.amount,
          effectId: input.effectId,
        });
        if (!prepared.ok) {
          throw new PrepareError(prepared.error);
        }
        donationPrepId = prepared.donationPrepId;
        try {
          rawBigInt = BigInt(prepared.rawAmount);
        } catch {
          throw new DonationFlowValidationError("Amount must be a valid number.");
        }
        if (rawBigInt <= BigInt(0)) {
          throw new DonationFlowValidationError("Amount must be greater than zero.");
        }
      } else {
        const rawAmount = displayToRawAmount(input.amount, input.token.decimals);
        try {
          rawBigInt = BigInt(rawAmount);
        } catch {
          throw new DonationFlowValidationError("Amount must be a valid number.");
        }
        if (rawAmount === "0" || rawBigInt <= BigInt(0)) {
          throw new DonationFlowValidationError("Amount must be greater than zero.");
        }
      }

      const hasTrustline = await this.adapters.checkTrustline(
        input.walletAddress,
        input.token,
      );
      const needsTrustlineStep = needsTrustline(input.token, hasTrustline);

      const result = await this.adapters.donate({
        donorAddress: input.walletAddress,
        handleHash: handleHashBuffer(input.handle),
        token: input.token.contract_address,
        amount: rawBigInt,
        needsTrustline: needsTrustlineStep,
        trustlineToken: needsTrustlineStep ? input.token : undefined,
      });

      this.setState({
        phase: "confirming",
        error: null,
        txHash: result.hash,
      });

      await this.adapters.verify(
        result.hash,
        input.message,
        input.donorName,
        donationPrepId,
      );

      this.setState({
        phase: "success",
        error: null,
        txHash: result.hash,
      });
    } catch (err) {
      this.setState({
        phase: "error",
        error: mapDonationFlowError(err),
        txHash: this.state.txHash,
      });
    }
  }
}
