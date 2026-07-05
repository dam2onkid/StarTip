import { describe, it, expect } from "vitest";
import { buildDonateUrl } from "@/lib/creators/qr";

/**
 * `buildDonateUrl` is a pure, client-safe helper that produces the absolute
 * `/creator/[handle]/donate` URL a QR code encodes. It is the single source
 * of truth for the donate URL shape shared by the dashboard QR card and the
 * public Creator profile QR.
 */
describe("buildDonateUrl", () => {
  it("builds an absolute donate URL from a handle and origin", () => {
    expect(buildDonateUrl("ada", "https://startip.app")).toBe(
      "https://startip.app/creator/ada/donate",
    );
  });

  it("normalizes the handle to lowercase and trims whitespace", () => {
    expect(buildDonateUrl("  Ada  ", "https://startip.app")).toBe(
      "https://startip.app/creator/ada/donate",
    );
  });

  it("preserves handles with hyphens and underscores", () => {
    expect(buildDonateUrl("ada-lovelace_99", "https://startip.app")).toBe(
      "https://startip.app/creator/ada-lovelace_99/donate",
    );
  });

  it("handles an origin with a trailing slash", () => {
    expect(buildDonateUrl("ada", "https://startip.app/")).toBe(
      "https://startip.app/creator/ada/donate",
    );
  });

  it("resolves an absolute path against an origin that has its own path", () => {
    expect(buildDonateUrl("ada", "https://startip.app/some/base")).toBe(
      "https://startip.app/creator/ada/donate",
    );
  });

  it("returns a root-relative URL when the origin is empty", () => {
    expect(buildDonateUrl("ada", "")).toBe("/creator/ada/donate");
  });
});

