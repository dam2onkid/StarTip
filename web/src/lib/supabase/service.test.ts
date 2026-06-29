// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "@/lib/env";

const createClientSpy = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    createClientSpy(...args);
    return { auth: {} };
  },
}));

describe("supabase/service", () => {
  beforeEach(() => {
    createClientSpy.mockClear();
  });

  it("createServiceClient is wired to the service URL and service role key", async () => {
    const { createServiceClient } = await import("@/lib/supabase/service");
    createServiceClient();
    expect(createClientSpy).toHaveBeenCalledWith(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      }),
    );
  });

  it("createServiceClient returns a fresh client per call (no session singleton)", async () => {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const a = createServiceClient();
    const b = createServiceClient();
    expect(a).not.toBe(b);
    expect(createClientSpy).toHaveBeenCalledTimes(2);
  });
});
