import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    /**
     * When "true", the public discovery surfaces (`/creator/explore` and
     * `/creator/[handle]`) serve hardcoded mock Creator data from
     * `lib/creators/mock.ts` instead of querying Supabase. Local-only UI
     * testing flag; defaults to false.
     */
    USE_MOCK_DATA: z.string().default("false"),
  },
  client: {
    NEXT_PUBLIC_STELLAR_NETWORK: z
      .enum(["testnet", "pubnet"])
      .default("testnet"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID: z.string().min(1),
    NEXT_PUBLIC_LENIS_DISABLED: z.string().default("false"),
  },
  runtimeEnv: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    USE_MOCK_DATA: process.env.USE_MOCK_DATA,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID:
      process.env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID,
    NEXT_PUBLIC_LENIS_DISABLED: process.env.NEXT_PUBLIC_LENIS_DISABLED,
  },
});
