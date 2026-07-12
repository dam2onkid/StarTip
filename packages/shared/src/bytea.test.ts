// @vitest-environment node
import { describe, it, expect } from "vitest";
import { toByteaHex } from "./bytea";

describe("bytea", () => {
  it("formats a Buffer to a Postgres bytea hex literal", () => {
    const bytes = Buffer.from("hello", "utf8");
    expect(toByteaHex(bytes)).toBe("\\x68656c6c6f");
  });

  it("formats a Uint8Array to a Postgres bytea hex literal", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(toByteaHex(bytes)).toBe("\\xdeadbeef");
  });

  it("formats a 32-byte hash", () => {
    const hash = Buffer.alloc(32, 0xab);
    expect(toByteaHex(hash)).toBe("\\x" + "ab".repeat(32));
  });
});
