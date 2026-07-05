import { describe, it, expect } from "vitest";
import { deriveOnboardingState } from "@/lib/onboarding/state";
import type { OnboardingProfile } from "@/lib/onboarding/state";

function profile(over: Partial<OnboardingProfile> = {}): OnboardingProfile {
  return {
    handle: null,
    owner_address: null,
    onchain_registered: false,
    ...over,
  };
}

describe("deriveOnboardingState", () => {
  it("returns 'profile_pending' when no handle is claimed", () => {
    expect(deriveOnboardingState(profile())).toBe("profile_pending");
    expect(deriveOnboardingState(profile({ handle: "" }))).toBe("profile_pending");
  });

  it("returns 'wallet_pending' when a handle is claimed but no wallet is linked", () => {
    expect(
      deriveOnboardingState(profile({ handle: "ada", owner_address: null })),
    ).toBe("wallet_pending");
  });

  it("returns 'onchain_pending' when a wallet is linked but not registered on-chain", () => {
    expect(
      deriveOnboardingState({
        handle: "ada",
        owner_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        onchain_registered: false,
      }),
    ).toBe("onchain_pending");
  });

  it("returns 'active' when onchain_registered is true", () => {
    expect(
      deriveOnboardingState({
        handle: "ada",
        owner_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        onchain_registered: true,
      }),
    ).toBe("active");
  });

  it("treats a missing handle as profile_pending even if owner_address is set (defensive)", () => {
    expect(
      deriveOnboardingState({
        handle: null,
        owner_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        onchain_registered: false,
      }),
    ).toBe("profile_pending");
  });
});
