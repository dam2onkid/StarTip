// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase/service";

/**
 * Live Events - database integration tests.
 *
 * These tests exercise the real Postgres sequence function and the live_events
 * unique constraints under concurrent callers. They are skipped when the
 * service-role Supabase client is not configured.
 */

const integrationEnabled =
  typeof process.env.SUPABASE_URL === "string" &&
  process.env.SUPABASE_URL.length > 0 &&
  typeof process.env.SUPABASE_SERVICE_ROLE_KEY === "string" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0;

describe.skipIf(!integrationEnabled)("live_events database integration", () => {
  let service: SupabaseClient;

  beforeAll(() => {
    service = createServiceClient();
  });

  it("reserves unique, strictly increasing sequences under concurrent calls", async () => {
    const count = 50;
    const promises = Array.from({ length: count }, () =>
      service
        .rpc("next_live_event_sequence")
        .returns<{ next_live_event_sequence: number }>()
        .single(),
    );
    const results = await Promise.all(promises);

    const sequences = results
      .map((r) => (r.data as { next_live_event_sequence: number } | null)?.next_live_event_sequence)
      .filter((n): n is number => typeof n === "number");

    expect(sequences).toHaveLength(count);
    expect(new Set(sequences).size).toBe(count);

    const sorted = [...sequences].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
    }
  });
});
