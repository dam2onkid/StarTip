import { describe, it, expect, vi } from "vitest";
import { env } from "@/lib/env";

const singletonInstance = { auth: { getSession: vi.fn() } };
const createBrowserClientSpy = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => {
    createBrowserClientSpy(...args);
    return singletonInstance;
  },
}));

describe("supabase/client", () => {
  it("createBrowserClient is wired to the public URL and anon key", async () => {
    const { createBrowserClient } = await import("@/lib/supabase/client");
    createBrowserClient();
    expect(createBrowserClientSpy).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  });

  it("createBrowserClient is a singleton across calls", async () => {
    const { createBrowserClient } = await import("@/lib/supabase/client");
    expect(createBrowserClient()).toBe(createBrowserClient());
  });
});
