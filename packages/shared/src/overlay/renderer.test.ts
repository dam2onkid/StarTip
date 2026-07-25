// @vitest-environment node
/// <reference lib="dom" />
import { describe, it, expect } from "vitest";

/**
 * Overlay Renderer tests.
 *
 * These tests use the real bundled Default Pack and deterministic clocks to
 * assert fixed durations, dimensions, attribution fields, and Jump Scare
 * random selection behavior. The random-number source is the only replaced
 * seam for Jump Scare tests.
 */

async function validatedDefaultPack() {
  const { validatePack } = await import("./effect-packs");
  const { defaultPackManifest, defaultPackAssets } = await import("./default-pack");
  const res = await validatePack(defaultPackManifest, { assets: defaultPackAssets });
  if (!res.ok) throw new Error(`Default pack failed validation: ${res.error}`);
  return res;
}

function makeInput(overrides: Record<string, unknown> = {}): {
  donorName: string;
  amountDisplay: string;
  tokenSymbol: string;
  message?: string | null;
  effect?: { effectId: string } | null;
} {
  return {
    donorName: "Alice",
    amountDisplay: "2.00",
    tokenSymbol: "USDC",
    message: "Great stream!",
    effect: null,
    ...overrides,
  };
}

describe("planRender", () => {
  it("renders an ordinary Donation Alert with all visible fields", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 1000 };
    const res = planRender(makeInput(), { pack, clock, alertDurationMs: 10000 });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.plan.type).toBe("donation-alert");
    if (res.plan.type !== "donation-alert") return;

    expect(res.plan.donorName).toBe("Alice");
    expect(res.plan.amountDisplay).toBe("2.00");
    expect(res.plan.tokenSymbol).toBe("USDC");
    expect(res.plan.message).toBe("Great stream!");
    expect(res.plan.durationMs).toBe(10000);
    expect(res.plan.startedAt).toBe(1000);
    expect(res.plan.endsAt).toBe(11000);
  });

  it("uses the default alert duration when none is supplied", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 0 };
    const res = planRender(makeInput(), { pack, clock });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.durationMs).toBe(10000);
    expect(res.plan.endsAt).toBe(10000);
  });

  it("renders compact effect attribution and excludes the message", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 0 };
    const input = makeInput({ effect: { effectId: "screen-flash" }, message: "ignored" });
    const res = planRender(input, { pack, clock });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.attribution).toEqual({
      donorName: "Alice",
      amountDisplay: "2.00",
      tokenSymbol: "USDC",
      effectName: "Screen Flash",
    });
    expect("message" in res.plan).toBe(false);
  });

  it("rejects an undeclared effect", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const res = planRender(makeInput({ effect: { effectId: "ghost" } }), { pack });
    expect(res).toEqual({ ok: false, error: "undeclared_effect" });
  });

  it("plans Screen Flash to fade through white once over one second", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 500 };
    const res = planRender(makeInput({ effect: { effectId: "screen-flash" } }), { pack, clock });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.effectType).toBe("screen-flash");
    expect(res.plan.durationMs).toBe(1000);
    expect(res.plan.startedAt).toBe(500);
    expect(res.plan.endsAt).toBe(1500);
    expect(res.plan.geometry).toEqual({ type: "screen-flash", color: "#ffffff", repeat: 1 });
    expect(res.plan.media).toBeUndefined();
    expect(res.plan.audio).toBeUndefined();
  });

  it("plans Screen Cover to obscure the central 70% for three seconds", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 0 };
    const res = planRender(makeInput({ effect: { effectId: "screen-cover" } }), { pack, clock });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.effectType).toBe("screen-cover");
    expect(res.plan.durationMs).toBe(3000);
    expect(res.plan.endsAt).toBe(3000);
    expect(res.plan.geometry).toEqual({ type: "screen-cover", obscuredPct: 70 });
  });

  it("plans Tunnel Vision to leave a 35% circular view for five seconds", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 0 };
    const res = planRender(makeInput({ effect: { effectId: "tunnel-vision" } }), { pack, clock });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.effectType).toBe("tunnel-vision");
    expect(res.plan.durationMs).toBe(5000);
    expect(res.plan.endsAt).toBe(5000);
    expect(res.plan.geometry).toEqual({ type: "tunnel-vision", visibleDiameterPct: 35 });
  });

  it("plans Jump Scare with a static image for two seconds", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const clock = { now: () => 0 };
    const random = { random: () => 0.1 };
    const res = planRender(makeInput({ effect: { effectId: "jump-scare" } }), { pack, clock, random });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.effectType).toBe("jump-scare");
    expect(res.plan.durationMs).toBe(2000);
    expect(res.plan.media).toBeDefined();
    expect(res.plan.media?.assetType).toBe("image");
    expect(res.plan.media?.maxDisplayPct).toBe(80);
    expect(res.plan.audio).toEqual({
      assetId: "jump-scare-audio",
      path: "default-pack/jump-scare/audio.wav",
      volume: 0.7,
    });
  });

  it("plans Jump Scare with a GIF for four seconds", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const random = { random: () => 0.5 };
    const res = planRender(makeInput({ effect: { effectId: "jump-scare" } }), { pack, random });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.type).toBe("effect");
    if (res.plan.type !== "effect") return;

    expect(res.plan.media?.assetType).toBe("gif");
    expect(res.plan.durationMs).toBe(4000);
  });

  it("proves every Jump Scare asset can be selected", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const assetIds = ["jump-scare-1", "jump-scare-2", "jump-scare-3"];
    const selected = new Set<string>();

    for (let i = 0; i < assetIds.length; i++) {
      const random = { random: () => (i + 0.5) / assetIds.length };
      const res = planRender(makeInput({ effect: { effectId: "jump-scare" } }), { pack, random });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      if (res.plan.type === "effect") {
        expect(res.plan.media).toBeDefined();
        selected.add(res.plan.media!.assetId);
      }
    }

    expect(selected).toEqual(new Set(assetIds));
  });

  it("allows consecutive Jump Scare repeats", async () => {
    const { planRender } = await import("./renderer");
    const pack = await validatedDefaultPack();
    const random = { random: () => 0.5 };

    const first = planRender(makeInput({ effect: { effectId: "jump-scare" } }), { pack, random });
    const second = planRender(makeInput({ effect: { effectId: "jump-scare" } }), { pack, random });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.plan.type === "effect" && second.plan.type === "effect").toBe(true);
    if (first.plan.type !== "effect" || second.plan.type !== "effect") return;

    expect(first.plan.media?.assetId).toBe(second.plan.media?.assetId);
  });
});
