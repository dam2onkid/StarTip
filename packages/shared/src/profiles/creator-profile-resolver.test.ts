// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveProfileByHandleHash,
  type CreatorProfile,
} from "./creator-profile-resolver";
import { toByteaHex } from "../bytea";

const HANDLE_HASH = Buffer.alloc(32, 0xab);
const HANDLE_HASH_BYTEA = toByteaHex(HANDLE_HASH);

function createMockSupabase() {
  const recorded: { select?: string; eq?: { col: string; value: unknown } } = {};
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => {
        recorded.select = cols;
        return {
          eq: vi.fn((col: string, value: unknown) => {
            recorded.eq = { col, value };
            return {
              maybeSingle: vi.fn(() =>
                Promise.resolve(
                  responses[`${table}:select`] ?? { data: null, error: null },
                ),
              ),
            };
          }),
        };
      }),
    })),
  } as unknown as SupabaseClient;

  return {
    supabase,
    recorded,
    setResponse: (key: string, value: { data: unknown; error: unknown }) => {
      responses[key] = value;
    },
  };
}

const EXPECTED_PROFILE: CreatorProfile = {
  id: "p1",
  owner_address: "G...",
  handle_hash: HANDLE_HASH_BYTEA,
  overlay_id: null,
};

describe("resolveProfileByHandleHash", () => {
  it("formats the raw hash and queries profiles by handle_hash", async () => {
    const { supabase, recorded, setResponse } = createMockSupabase();
    setResponse("profiles:select", {
      data: { id: "p1", owner_address: "G...", overlay_id: null },
      error: null,
    });

    const result = await resolveProfileByHandleHash(supabase, HANDLE_HASH);

    expect(result).toEqual(EXPECTED_PROFILE);
    expect(recorded.select).toBe("id, owner_address, overlay_id");
    expect(recorded.eq).toEqual({ col: "handle_hash", value: HANDLE_HASH_BYTEA });
  });

  it("returns null when no profile matches the hash", async () => {
    const { supabase, setResponse } = createMockSupabase();
    setResponse("profiles:select", { data: null, error: null });

    const result = await resolveProfileByHandleHash(supabase, HANDLE_HASH);

    expect(result).toBeNull();
  });

  it("returns null when the profiles query fails", async () => {
    const { supabase, setResponse } = createMockSupabase();
    setResponse("profiles:select", { data: null, error: { message: "db down" } });

    const result = await resolveProfileByHandleHash(supabase, HANDLE_HASH);

    expect(result).toBeNull();
  });
});
