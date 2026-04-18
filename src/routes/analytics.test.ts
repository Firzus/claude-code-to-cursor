import { describe, expect, mock, test } from "bun:test";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

if (!SKIP) {
  const errorsPayload = {
    errors: [
      {
        id: 42,
        timestamp: 1_700_000_000_000,
        model: "claude-opus-4-7",
        error: "upstream timeout",
        latencyMs: 1234,
        route: "anthropic",
      },
    ],
    total: 1,
    totalAllTime: 7,
  };

  let lastCall: { limit: number; since: number; until: number } | null = null;

  mock.module("../db", () => ({
    getAnalytics: () => ({}),
    getAnalyticsTimeline: () => [],
    getRecentRequests: () => ({ requests: [], total: 0 }),
    resetAnalytics: () => ({ deletedCount: 0 }),
    getRecentErrors: (limit: number, since: number, until: number) => {
      lastCall = { limit, since, until };
      return errorsPayload;
    },
  }));

  const { handleAnalyticsErrors } = await import("./analytics");

  describe("handleAnalyticsErrors", () => {
    test("returns errors from getRecentErrors using default limit and period=day", async () => {
      const before = Date.now();
      const url = new URL("http://localhost/api/analytics/errors");
      const res = handleAnalyticsErrors(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as typeof errorsPayload;
      expect(body).toEqual(errorsPayload);

      expect(lastCall).not.toBeNull();
      expect(lastCall?.limit).toBe(10);
      // Default period is "day" -> since ≈ now - 24h
      const expectedSince = before - 86_400_000;
      expect(lastCall?.since).toBeGreaterThanOrEqual(expectedSince - 1000);
      expect(lastCall?.since).toBeLessThanOrEqual(expectedSince + 1000);
    });

    test("respects limit and period query params", () => {
      const url = new URL("http://localhost/api/analytics/errors?limit=5&period=week");
      const before = Date.now();
      handleAnalyticsErrors(url);
      expect(lastCall?.limit).toBe(5);
      const expectedSince = before - 7 * 86_400_000;
      expect(lastCall?.since).toBeGreaterThanOrEqual(expectedSince - 1000);
      expect(lastCall?.since).toBeLessThanOrEqual(expectedSince + 1000);
    });

    test("clamps invalid limit to default 10", () => {
      const url = new URL("http://localhost/api/analytics/errors?limit=9999");
      handleAnalyticsErrors(url);
      expect(lastCall?.limit).toBe(10);
    });

    test("period=all uses since=0", () => {
      const url = new URL("http://localhost/api/analytics/errors?period=all");
      handleAnalyticsErrors(url);
      expect(lastCall?.since).toBe(0);
    });
  });
} else {
  test.skip("handleAnalyticsErrors (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
