import { afterEach, describe, expect, test } from "bun:test";
import { __testing, clearRateLimitCache } from "./anthropic-client";

afterEach(() => {
  // Reset rate-limit cache between tests so state doesn't leak.
  clearRateLimitCache();
});

describe("rate-limit probe lifecycle", () => {
  const ONE_HOUR = 60 * 60 * 1000;
  const SOFT_MS = 5 * 60 * 1000;

  test("fresh state returns not limited and no probe", () => {
    const result = __testing.checkRateLimit();
    expect(result).toEqual({ limited: false, isProbe: false });
  });

  test("hard block window: all callers limited, no probe granted", () => {
    __testing.cacheRateLimit(Date.now() + ONE_HOUR);
    const a = __testing.checkRateLimit();
    const b = __testing.checkRateLimit();
    expect(a).toEqual({ limited: true, isProbe: false });
    expect(b).toEqual({ limited: true, isProbe: false });
  });

  test("soft expiry: first caller gets probe slot, second is blocked", () => {
    // Simulate a rate limit whose soft-expiry has passed but hard expiry hasn't.
    __testing.setRateLimitCacheState({
      resetAt: Date.now() + ONE_HOUR,
      originalResetAt: Date.now() + ONE_HOUR,
      cachedAt: Date.now() - SOFT_MS - 1_000,
      probeInFlight: false,
    });

    const a = __testing.checkRateLimit();
    expect(a).toEqual({ limited: false, isProbe: true });

    const b = __testing.checkRateLimit();
    expect(b).toEqual({ limited: true, isProbe: false });
  });

  test("finalizeRateLimitProbe('cleared') tears down the whole cache", () => {
    __testing.cacheRateLimit(Date.now() + ONE_HOUR);
    const existing = __testing.getRateLimitCacheState();
    if (!existing) throw new Error("Expected cache state to exist");
    __testing.setRateLimitCacheState({
      ...existing,
      probeInFlight: true,
    });

    __testing.finalizeRateLimitProbe("cleared");
    expect(__testing.getRateLimitCacheState()).toBeNull();
  });

  test("finalizeRateLimitProbe('retry') releases the probe slot (regression)", () => {
    // Regression guard for the bug where probeInFlight stayed true after a
    // failed probe, locking out future requests until the hard TTL expired.
    __testing.setRateLimitCacheState({
      resetAt: Date.now() + ONE_HOUR,
      originalResetAt: Date.now() + ONE_HOUR,
      cachedAt: Date.now() - SOFT_MS - 1_000,
      probeInFlight: true,
    });

    __testing.finalizeRateLimitProbe("retry");

    expect(__testing.getRateLimitCacheState()?.probeInFlight).toBe(false);
    // Next caller should be able to claim the probe slot again.
    const next = __testing.checkRateLimit();
    expect(next).toEqual({ limited: false, isProbe: true });
  });

  test("cleanupExpiredRateLimit clears stale cache entries", () => {
    __testing.setRateLimitCacheState({
      resetAt: Date.now() - 1_000, // already expired
      originalResetAt: Date.now() - 1_000,
      cachedAt: Date.now() - ONE_HOUR,
      probeInFlight: false,
    });

    __testing.cleanupExpiredRateLimit();
    expect(__testing.getRateLimitCacheState()).toBeNull();
  });

  test("cleanupExpiredRateLimit keeps non-expired cache entries", () => {
    __testing.cacheRateLimit(Date.now() + ONE_HOUR);
    __testing.cleanupExpiredRateLimit();
    expect(__testing.getRateLimitCacheState()).not.toBeNull();
  });
});
