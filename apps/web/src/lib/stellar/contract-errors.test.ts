import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERROR_MESSAGES,
  decodeContractErrorCode,
  friendlyOnchainError,
} from "@/lib/stellar/contract-errors";

describe("decodeContractErrorCode", () => {
  it("decodes the numeric form Error(Contract, #N) from production RPC", () => {
    expect(decodeContractErrorCode("HostError: Error(Contract, #8)")).toBe(
      "AlreadyRegistered",
    );
    expect(decodeContractErrorCode("Error(Contract, #1)")).toBe("Unauthorized");
    expect(decodeContractErrorCode("Error(Contract, #6)")).toBe(
      "TokenNotAllowed",
    );
  });

  it("decodes the variant name form Error(VariantName)", () => {
    expect(decodeContractErrorCode("Error(Paused)")).toBe("Paused");
    expect(decodeContractErrorCode("Error(AlreadyRegistered)")).toBe(
      "AlreadyRegistered",
    );
  });

  it("decodes errors embedded in a larger diagnostic log", () => {
    const raw =
      'HostError: Error(Contract, #8)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CCX2..., topics:[error, Error(Contract, #8)]';
    expect(decodeContractErrorCode(raw)).toBe("AlreadyRegistered");
  });

  it("returns null for unrecognized codes and non-contract errors", () => {
    expect(decodeContractErrorCode("Error(Contract, #99)")).toBeNull();
    expect(decodeContractErrorCode("some network blip")).toBeNull();
    expect(decodeContractErrorCode("")).toBeNull();
  });
});

describe("friendlyOnchainError", () => {
  it("maps a recognized contract error to its UI message", () => {
    const err = new Error(
      'simulate register_creator failed: HostError: Error(Contract, #8)\n\nEvent log...',
    );
    expect(friendlyOnchainError(err, "On-chain registration failed.")).toBe(
      CONTRACT_ERROR_MESSAGES.AlreadyRegistered,
    );
  });

  it("returns the fallback for unrecognized errors, not the raw message", () => {
    const err = new Error("some unrelated network failure: timeout");
    expect(friendlyOnchainError(err, "On-chain registration failed.")).toBe(
      "On-chain registration failed.",
    );
  });

  it("returns the fallback for non-Error throwables", () => {
    expect(friendlyOnchainError("string throw", "fallback")).toBe("fallback");
    expect(friendlyOnchainError(undefined, "fallback")).toBe("fallback");
  });
});
