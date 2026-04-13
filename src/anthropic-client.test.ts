import { afterEach, describe, expect, test } from "bun:test";
import { __testing, applyCacheTtl, clearRateLimitCache } from "./anthropic-client";
import type { AnthropicRequest } from "./types";

afterEach(() => {
  // Reset rate-limit cache between tests so state doesn't leak.
  clearRateLimitCache();
});

function makeRequest(): AnthropicRequest {
  return {
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello", cache_control: { type: "ephemeral" } }],
      },
    ],
    system: [{ type: "text", text: "you are claude", cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: "grep",
        description: "",
        input_schema: { type: "object", properties: {} },
        cache_control: { type: "ephemeral" },
      },
    ],
  } as unknown as AnthropicRequest;
}

describe("applyCacheTtl", () => {
  test("5m strips ttl from every cache_control block (system, messages, tools)", () => {
    const req = makeRequest();
    // Simulate Cursor sending stale ttl values
    (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control.ttl = "1h";
    const firstUserBlock = (
      req.messages[0]!.content as Array<{ cache_control: Record<string, unknown> }>
    )[0]!;
    firstUserBlock.cache_control.ttl = "1h";
    (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control.ttl = "1h";

    applyCacheTtl(req, "5m");

    expect(
      (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
    });
    expect(firstUserBlock.cache_control).toEqual({ type: "ephemeral" });
    expect(
      (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({ type: "ephemeral" });
  });

  test("1h stamps ttl: '1h' on every cache_control block (system, messages, tools)", () => {
    const req = makeRequest();

    applyCacheTtl(req, "1h");

    expect(
      (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    expect(
      (req.messages[0]!.content as Array<{ cache_control: Record<string, unknown> }>)[0]!
        .cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    expect(
      (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
  });

  test("leaves blocks without cache_control untouched", () => {
    const req: AnthropicRequest = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "plain" }],
        },
      ],
    } as AnthropicRequest;

    applyCacheTtl(req, "1h");

    const block = (req.messages[0]!.content as unknown as Array<Record<string, unknown>>)[0]!;
    expect(block.cache_control).toBeUndefined();
  });

  test("handles tools array without cache_control", () => {
    const req: AnthropicRequest = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "read",
          description: "",
          input_schema: { type: "object", properties: {} },
        },
      ],
    } as unknown as AnthropicRequest;

    // Should not throw on tools without cache_control
    expect(() => applyCacheTtl(req, "1h")).not.toThrow();
    expect(
      (req.tools as unknown as Array<Record<string, unknown>>)[0]!.cache_control,
    ).toBeUndefined();
  });
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
    __testing.setRateLimitCacheState({
      ...__testing.getRateLimitCacheState()!,
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
