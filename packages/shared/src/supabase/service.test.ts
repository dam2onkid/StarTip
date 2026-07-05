// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

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
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
  });

  it("createServiceClient is wired to the service URL and service role key", async () => {
    const { createServiceClient } = await import("./service");
    createServiceClient();
    expect(createClientSpy).toHaveBeenCalledWith(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      }),
    );
  });

  it("createServiceClient returns a fresh client per call (no session singleton)", async () => {
    const { createServiceClient } = await import("./service");
    const a = createServiceClient();
    const b = createServiceClient();
    expect(a).not.toBe(b);
    expect(createClientSpy).toHaveBeenCalledTimes(2);
  });
});
