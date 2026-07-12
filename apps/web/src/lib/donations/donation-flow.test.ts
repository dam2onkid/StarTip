// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  DonationFlow,
  VerifyError,
  type DonationFlowInput,
  type DonationFlowState,
} from "./donation-flow";
import { DonateError, type DonateArgs, type DonateResult } from "./donate";
import type { TokenAllowlistEntry } from "./token";

/**
 * DonationFlow unit tests. The module is the seam for the donor's journey:
 * idle -> submitting -> confirming -> success / error. It delegates to fake
 * adapters for on-chain invocation, trustline checking, and verify polling so
 * phase transitions and error mapping can be tested without a real RPC or DOM.
 */

const USDC_TOKEN: TokenAllowlistEntry = {
  contract_address: "CUSDC",
  symbol: "USDC",
  name: "USD Coin",
  issuer: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
  decimals: 6,
  icon_url: null,
};

const XLM_TOKEN: TokenAllowlistEntry = {
  contract_address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  symbol: "XLM",
  name: "Stellar Lumens",
  issuer: null,
  decimals: 7,
  icon_url: null,
};

const INPUT: DonationFlowInput = {
  handle: "ada",
  walletAddress: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
  token: USDC_TOKEN,
  amount: "1.5",
  message: "hello",
  donorName: "Anon",
};

function collectStates(flow: DonationFlow): DonationFlowState[] {
  const states: DonationFlowState[] = [];
  flow.subscribe((state) => states.push(state));
  return states;
}

function fakeAdapters(over: {
  donate?: (args: DonateArgs) => Promise<DonateResult>;
  checkTrustline?: (walletAddress: string, token: TokenAllowlistEntry) => Promise<boolean>;
  verify?: (txHash: string, message: string, donorName: string) => Promise<void>;
} = {}) {
  const donate =
    over.donate ??
    vi.fn(async () => ({ status: "PENDING", hash: "deadbeef".repeat(8) }));
  const checkTrustline =
    over.checkTrustline ??
    vi.fn(async () => true);
  const verify =
    over.verify ??
    vi.fn(async () => {});
  return { donate, checkTrustline, verify };
}

describe("DonationFlow", () => {
  it("starts at idle", () => {
    const flow = new DonationFlow(fakeAdapters());
    expect(flow.getState()).toEqual({ phase: "idle", error: null, txHash: null });
  });

  it("transitions idle -> submitting -> confirming -> success on a happy path", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);
    const states = collectStates(flow);

    await flow.start(INPUT);

    expect(states.map((s) => s.phase)).toEqual([
      "submitting",
      "confirming",
      "success",
    ]);
    expect(flow.getState()).toMatchObject({
      phase: "success",
      error: null,
      txHash: "deadbeef".repeat(8),
    });
    expect(adapters.donate).toHaveBeenCalledOnce();
    expect(adapters.verify).toHaveBeenCalledOnce();
  });

  it("passes converted raw amount and computed handle hash to donate", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    const passed = (adapters.donate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DonateArgs;
    expect(passed.donorAddress).toBe(INPUT.walletAddress);
    expect(passed.token).toBe(USDC_TOKEN.contract_address);
    expect(passed.amount).toBe(BigInt("1500000"));
    expect(passed.handleHash).toHaveLength(32);
  });

  it("checks trustline and passes needsTrustline + trustlineToken when missing", async () => {
    const adapters = fakeAdapters({ checkTrustline: vi.fn(async () => false) });
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    expect(adapters.checkTrustline).toHaveBeenCalledOnce();
    expect(adapters.checkTrustline).toHaveBeenCalledWith(
      INPUT.walletAddress,
      USDC_TOKEN,
    );
    const passed = (adapters.donate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DonateArgs;
    expect(passed.needsTrustline).toBe(true);
    expect(passed.trustlineToken).toBe(USDC_TOKEN);
  });

  it("omits needsTrustline when the donor already has a trustline", async () => {
    const adapters = fakeAdapters({ checkTrustline: vi.fn(async () => true) });
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    const passed = (adapters.donate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DonateArgs;
    expect(passed.needsTrustline).toBe(false);
    expect(passed.trustlineToken).toBeUndefined();
  });

  it("never needs a trustline for native XLM even if the adapter returns false", async () => {
    const adapters = fakeAdapters({ checkTrustline: vi.fn(async () => false) });
    const flow = new DonationFlow(adapters);

    await flow.start({ ...INPUT, token: XLM_TOKEN });

    const passed = (adapters.donate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DonateArgs;
    expect(passed.needsTrustline).toBe(false);
    expect(passed.trustlineToken).toBeUndefined();
  });

  it("passes message and donor name to verify", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    expect(adapters.verify).toHaveBeenCalledWith(
      "deadbeef".repeat(8),
      INPUT.message,
      INPUT.donorName,
    );
  });

  it("transitions to error and maps a DonateError to a user-facing message", async () => {
    const adapters = fakeAdapters({
      donate: vi.fn(async () => {
        throw new DonateError("Paused");
      }),
    });
    const flow = new DonationFlow(adapters);
    const states = collectStates(flow);

    await flow.start(INPUT);

    expect(states.map((s) => s.phase)).toEqual(["submitting", "error"]);
    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "This creator is currently paused and cannot receive donations.",
      txHash: null,
    });
  });

  it("transitions to error and maps a trustline_failed DonateError", async () => {
    const adapters = fakeAdapters({
      checkTrustline: vi.fn(async () => false),
      donate: vi.fn(async () => {
        throw new DonateError("trustline_failed");
      }),
    });
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    expect(flow.getState().error).toMatch(
      /could not establish a trustline/i,
    );
  });

  it("transitions to error on verify failure and keeps the tx hash", async () => {
    const adapters = fakeAdapters({
      verify: vi.fn(async () => {
        throw new VerifyError("tx_failed");
      }),
    });
    const flow = new DonationFlow(adapters);
    const states = collectStates(flow);

    await flow.start(INPUT);

    expect(states.map((s) => s.phase)).toEqual([
      "submitting",
      "confirming",
      "error",
    ]);
    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "Server error: tx_failed",
      txHash: "deadbeef".repeat(8),
    });
  });

  it("transitions to error on an unexpected verification error", async () => {
    const adapters = fakeAdapters({
      verify: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "An unexpected error occurred.",
    });
  });

  it("transitions to error when the amount is zero or negative", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start({ ...INPUT, amount: "0" });

    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "Amount must be greater than zero.",
    });
    expect(adapters.donate).not.toHaveBeenCalled();
  });

  it("transitions to error when the amount is empty", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start({ ...INPUT, amount: "" });

    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "Amount must be greater than zero.",
    });
  });

  it("transitions to error when the amount is not a valid number", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start({ ...INPUT, amount: "abc" });

    expect(flow.getState()).toMatchObject({
      phase: "error",
      error: "Amount must be a valid number.",
    });
    expect(adapters.donate).not.toHaveBeenCalled();
  });

  it("transitions to error and maps generic on-chain errors to a fallback", async () => {
    const adapters = fakeAdapters({
      donate: vi.fn(async () => {
        throw new Error("something bad");
      }),
    });
    const flow = new DonationFlow(adapters);

    await flow.start(INPUT);

    expect(flow.getState().error).toBe("An unexpected error occurred.");
  });

  it("resets back to idle", async () => {
    const adapters = fakeAdapters({
      donate: vi.fn(async () => {
        throw new DonateError("Paused");
      }),
    });
    const flow = new DonationFlow(adapters);
    await flow.start(INPUT);
    flow.reset();

    expect(flow.getState()).toEqual({ phase: "idle", error: null, txHash: null });
  });

  it("unsubscribe stops receiving state updates", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);
    const states: DonationFlowState[] = [];
    const unsubscribe = flow.subscribe((state) => states.push(state));
    unsubscribe();

    await flow.start(INPUT);

    expect(states).toHaveLength(0);
  });

  it("surfaces a DonationFlowValidationError message", async () => {
    const adapters = fakeAdapters();
    const flow = new DonationFlow(adapters);

    await flow.start({ ...INPUT, amount: "0" });

    expect(flow.getState().error).toBe("Amount must be greater than zero.");
  });
});
