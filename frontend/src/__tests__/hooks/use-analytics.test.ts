import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAnalyticsErrors,
  useAnalyticsRequests,
  useAnalyticsSummary,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { renderHookWithQuery } from "../test-utils";

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockSummary = {
  period: "day",
  totalRequests: 42,
  claudeCodeRequests: 40,
  errorRequests: 2,
  totalInputTokens: 10_000,
  totalOutputTokens: 5_000,
  totalCacheReadTokens: 3_000,
  totalCacheCreationTokens: 1_000,
  cacheHitRate: 0.75,
  cacheSavingsUsdEstimate: 0.81,
  periodStart: Date.now() - 86_400_000,
  periodEnd: Date.now(),
};

const mockRequests = {
  requests: [
    {
      id: 1,
      timestamp: Date.now(),
      model: "claude-opus-4-7",
      source: "claude_code" as const,
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
      stream: true,
      latencyMs: 1200,
      error: null,
    },
  ],
  total: 1,
};

const mockTimeline = {
  period: "day",
  buckets: [
    {
      timestamp: Date.now(),
      requests: 10,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheCreationTokens: 100,
      errorCount: 0,
    },
  ],
};

describe("useAnalyticsSummary", () => {
  it("returns summary data", async () => {
    mockApiFetch.mockResolvedValueOnce(mockSummary);

    const { result } = renderHookWithQuery(() => useAnalyticsSummary("day"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalRequests).toBe(42);
  });

  it("handles error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHookWithQuery(() => useAnalyticsSummary("day"));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAnalyticsRequests", () => {
  it("returns request data with correct pagination", async () => {
    mockApiFetch.mockResolvedValueOnce(mockRequests);

    const { result } = renderHookWithQuery(() => useAnalyticsRequests(20, "day", 1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.requests).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});

describe("useAnalyticsTimeline", () => {
  it("returns timeline data", async () => {
    mockApiFetch.mockResolvedValueOnce(mockTimeline);

    const { result } = renderHookWithQuery(() => useAnalyticsTimeline("day"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.buckets).toHaveLength(1);
  });
});

const mockErrors = {
  errors: [
    {
      id: 1,
      timestamp: Date.now(),
      model: "claude-opus-4-7",
      error: "upstream timeout",
      latencyMs: 3200,
      route: "anthropic" as const,
    },
  ],
  total: 1,
  totalAllTime: 5,
};

describe("useAnalyticsErrors", () => {
  it("returns errors data and hits the errors endpoint", async () => {
    mockApiFetch.mockResolvedValueOnce(mockErrors);

    const { result } = renderHookWithQuery(() => useAnalyticsErrors("day"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errors).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.totalAllTime).toBe(5);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/analytics/errors?period=day"),
      expect.anything(),
    );
  });

  it("handles error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHookWithQuery(() => useAnalyticsErrors("week"));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
