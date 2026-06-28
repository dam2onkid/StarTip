import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
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
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID:
      process.env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID,
    NEXT_PUBLIC_LENIS_DISABLED: process.env.NEXT_PUBLIC_LENIS_DISABLED,
  },
});
