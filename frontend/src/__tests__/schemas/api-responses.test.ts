import { describe, it, expect } from "vitest";
import {
  healthResponseSchema,
  analyticsResponseSchema,
  requestRecordSchema,
  requestsResponseSchema,
  timelineBucketSchema,
  timelineResponseSchema,
  loginResponseSchema,
  authStatusResponseSchema,
  settingsResponseSchema,
} from "~/schemas/api-responses";

describe("healthResponseSchema", () => {
  it("accepts valid health response", () => {
    const data = {
      status: "ok",
      claudeCode: { authenticated: true, expiresAt: 1234567890 },
      rateLimit: {
        isLimited: false,
        resetAt: null,
        minutesRemaining: null,
        inSoftExpiry: false,
        cachedAt: null,
      },
    };
    expect(healthResponseSchema.parse(data)).toEqual(data);
  });

  it("accepts rate_limited status", () => {
    const data = {
      status: "rate_limited",
      claudeCode: { authenticated: true },
      rateLimit: {
        isLimited: true,
        resetAt: 9999999,
        minutesRemaining: 5,
        inSoftExpiry: false,
        cachedAt: Date.now(),
      },
    };
    expect(healthResponseSchema.parse(data).status).toBe("rate_limited");
  });

  it("rejects invalid status", () => {
    const data = {
      status: "unknown",
      claudeCode: { authenticated: true },
      rateLimit: {
        isLimited: false,
        resetAt: null,
        minutesRemaining: null,
        inSoftExpiry: false,
        cachedAt: null,
      },
    };
    expect(() => healthResponseSchema.parse(data)).toThrow();
  });

  it("accepts optional tunnelUrl", () => {
    const data = {
      status: "ok",
      tunnelUrl: "https://my.tunnel.dev",
      claudeCode: { authenticated: false },
      rateLimit: {
        isLimited: false,
        resetAt: null,
        minutesRemaining: null,
        inSoftExpiry: false,
        cachedAt: null,
      },
    };
    expect(healthResponseSchema.parse(data).tunnelUrl).toBe(
      "https://my.tunnel.dev",
    );
  });
});

describe("analyticsResponseSchema", () => {
  const validData = {
    period: "day",
    totalRequests: 10,
    claudeCodeRequests: 8,
    errorRequests: 2,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCacheReadTokens: 200,
    totalCacheCreationTokens: 100,
    cacheHitRate: 0.65,
    periodStart: 1000,
    periodEnd: 2000,
  };

  it("accepts valid analytics response", () => {
    expect(analyticsResponseSchema.parse(validData)).toEqual(validData);
  });

  it("rejects missing fields", () => {
    const { totalRequests, ...partial } = validData;
    expect(() => analyticsResponseSchema.parse(partial)).toThrow();
  });
});

describe("requestRecordSchema", () => {
  it("accepts valid request record", () => {
    const data = {
      id: 1,
      timestamp: Date.now(),
      model: "claude-opus-4-6",
      source: "claude_code",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheCreationTokens: 10,
      stream: true,
      latencyMs: 1500,
      error: null,
    };
    expect(requestRecordSchema.parse(data).id).toBe(1);
  });

  it("defaults cacheReadTokens to 0", () => {
    const data = {
      id: 2,
      timestamp: Date.now(),
      model: "claude-sonnet-4-6",
      source: "error",
      inputTokens: 100,
      outputTokens: 0,
      stream: false,
      latencyMs: null,
      error: "timeout",
    };
    const parsed = requestRecordSchema.parse(data);
    expect(parsed.cacheReadTokens).toBe(0);
    expect(parsed.cacheCreationTokens).toBe(0);
  });

  it("accepts numeric stream value", () => {
    const data = {
      id: 3,
      timestamp: Date.now(),
      model: "claude-haiku-4-5",
      source: "claude_code",
      inputTokens: 50,
      outputTokens: 25,
      stream: 1,
      latencyMs: 800,
      error: null,
    };
    expect(requestRecordSchema.parse(data).stream).toBe(1);
  });
});

describe("requestsResponseSchema", () => {
  it("accepts valid response with requests array", () => {
    const data = {
      requests: [
        {
          id: 1,
          timestamp: Date.now(),
          model: "test",
          source: "claude_code",
          inputTokens: 10,
          outputTokens: 5,
          stream: true,
          latencyMs: null,
          error: null,
        },
      ],
      total: 1,
    };
    const parsed = requestsResponseSchema.parse(data);
    expect(parsed.requests).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it("accepts empty requests array", () => {
    const data = { requests: [], total: 0 };
    expect(requestsResponseSchema.parse(data).requests).toEqual([]);
  });
});

describe("timelineBucketSchema", () => {
  it("accepts valid bucket", () => {
    const data = {
      timestamp: Date.now(),
      requests: 5,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheCreationTokens: 10,
      errorCount: 0,
    };
    expect(timelineBucketSchema.parse(data)).toEqual(data);
  });

  it("defaults cacheCreationTokens to 0", () => {
    const data = {
      timestamp: Date.now(),
      requests: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      errorCount: 0,
    };
    expect(timelineBucketSchema.parse(data).cacheCreationTokens).toBe(0);
  });
});

describe("timelineResponseSchema", () => {
  it("accepts valid timeline response", () => {
    const data = {
      period: "week",
      buckets: [],
    };
    expect(timelineResponseSchema.parse(data).period).toBe("week");
  });
});

describe("loginResponseSchema", () => {
  it("accepts valid login response", () => {
    const data = { authURL: "https://example.com/auth", state: "abc" };
    expect(loginResponseSchema.parse(data)).toEqual(data);
  });

  it("rejects missing authURL", () => {
    expect(() => loginResponseSchema.parse({ state: "abc" })).toThrow();
  });
});

describe("authStatusResponseSchema", () => {
  it("accepts authenticated status", () => {
    const data = { authenticated: true, expiresAt: 1234567890 };
    expect(authStatusResponseSchema.parse(data).authenticated).toBe(true);
  });

  it("accepts unauthenticated status with null expiresAt", () => {
    const data = { authenticated: false, expiresAt: null };
    expect(authStatusResponseSchema.parse(data)).toEqual(data);
  });
});

describe("settingsResponseSchema", () => {
  it("accepts valid settings response", () => {
    const data = {
      settings: {
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: true,
        thinkingEffort: "high",
      },
    };
    expect(settingsResponseSchema.parse(data)).toEqual(data);
  });

  it("rejects invalid model", () => {
    const data = {
      settings: {
        selectedModel: "claude-invalid",
        thinkingEnabled: true,
        thinkingEffort: "high",
      },
    };
    expect(() => settingsResponseSchema.parse(data)).toThrow();
  });

  it("rejects invalid effort", () => {
    const data = {
      settings: {
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: true,
        thinkingEffort: "ultra",
      },
    };
    expect(() => settingsResponseSchema.parse(data)).toThrow();
  });
});
