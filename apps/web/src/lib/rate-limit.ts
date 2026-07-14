export interface RateLimiter {
  /** Returns true when `key` has exceeded its configured rate limit. */
  isRateLimited(key: string): boolean;
}

/**
 * Create a simple in-memory sliding-window rate limiter.
 *
 * Each `key` keeps the timestamps of requests within `windowMs`. Once a key
 * reaches `maxRequests` in the window, additional requests are rejected until
 * older timestamps fall out of the window.
 *
 * Note: this is process-local memory. In a serverless/edge deployment where
 * each request may run in a fresh process, a distributed store (Redis, KV, or
 * a shared cache) should replace this implementation.
 */
export function createRateLimiter({
  maxRequests,
  windowMs,
}: {
  maxRequests: number;
  windowMs: number;
}): RateLimiter {
  const requestTimestampsByKey = new Map<string, number[]>();

  return {
    isRateLimited(key: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;
      const timestamps = requestTimestampsByKey.get(key) ?? [];
      const withinWindow = timestamps.filter((t) => t > windowStart);

      if (withinWindow.length >= maxRequests) {
        // Keep the window pruned without updating it, so the caller can retry
        // once the oldest timestamp falls out.
        requestTimestampsByKey.set(key, withinWindow);
        return true;
      }

      withinWindow.push(now);
      requestTimestampsByKey.set(key, withinWindow);
      return false;
    },
  };
}
