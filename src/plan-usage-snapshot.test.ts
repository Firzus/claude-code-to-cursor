import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

if (!SKIP) {
  // The snapshot module calls `getDb()` from ./db lazily, so we mock it with
  // an in-memory SQLite database for isolation.
  const testDb = new Database(":memory:");

  mock.module("./db", () => ({
    getDb: () => testDb,
  }));

  const {
    parseRateLimitHeaders,
    saveSnapshot,
    getLatestSnapshot,
    clearSnapshotCache,
    initPlanUsageSnapshotSchema,
  } = await import("./plan-usage-snapshot");

  initPlanUsageSnapshotSchema(testDb);

  function makeHeaders(entries: Record<string, string>): Headers {
    const h = new Headers();
    for (const [k, v] of Object.entries(entries)) h.set(k, v);
    return h;
  }

  beforeEach(() => {
    clearSnapshotCache();
    testDb.run("DELETE FROM plan_usage_snapshot");
  });

  describe("parseRateLimitHeaders", () => {
    test("parses a full set of unified ratelimit headers", () => {
      const h = makeHeaders({
        "anthropic-ratelimit-unified-status": "allowed",
        "anthropic-ratelimit-unified-5h-status": "allowed",
        "anthropic-ratelimit-unified-5h-utilization": "0.0184",
        "anthropic-ratelimit-unified-5h-reset": "1764554400",
        "anthropic-ratelimit-unified-7d-status": "allowed",
        "anthropic-ratelimit-unified-7d-utilization": "0.4800",
        "anthropic-ratelimit-unified-7d-reset": "1764615600",
        "anthropic-ratelimit-unified-representative-claim": "five_hour",
        "anthropic-ratelimit-unified-fallback-percentage": "0.2",
        "anthropic-ratelimit-unified-overage-status": "rejected",
      });

      const snapshot = parseRateLimitHeaders(h);
      expect(snapshot).not.toBeNull();
      if (!snapshot) throw new Error("unreachable");

      expect(snapshot.overallStatus).toBe("allowed");
      expect(snapshot.representativeClaim).toBe("five_hour");
      expect(snapshot.fallbackPercentage).toBe(0.2);
      expect(snapshot.overageStatus).toBe("rejected");

      expect(snapshot.fiveHour?.utilization).toBeCloseTo(0.0184, 4);
      expect(snapshot.fiveHour?.resetAt).toBe(1_764_554_400_000);
      expect(snapshot.fiveHour?.status).toBe("allowed");

      expect(snapshot.weekly?.utilization).toBeCloseTo(0.48, 4);
      expect(snapshot.weekly?.resetAt).toBe(1_764_615_600_000);
    });

    test("parses a partial set (only 5h)", () => {
      const h = makeHeaders({
        "anthropic-ratelimit-unified-5h-utilization": "0.5",
        "anthropic-ratelimit-unified-5h-reset": "1764554400",
        "anthropic-ratelimit-unified-5h-status": "warning",
      });

      const snapshot = parseRateLimitHeaders(h);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.fiveHour?.status).toBe("warning");
      expect(snapshot?.weekly).toBeNull();
      expect(snapshot?.representativeClaim).toBeNull();
    });

    test("returns null when no unified headers are present", () => {
      const h = makeHeaders({
        "content-type": "application/json",
        "retry-after": "60",
      });
      expect(parseRateLimitHeaders(h)).toBeNull();
    });

    test("rejects malformed numeric values", () => {
      const h = makeHeaders({
        "anthropic-ratelimit-unified-5h-utilization": "not-a-number",
        "anthropic-ratelimit-unified-5h-reset": "also-not-a-number",
      });
      // Both required fields invalid → window is dropped → no useful data
      expect(parseRateLimitHeaders(h)).toBeNull();
    });

    test("rejects unknown representative-claim values", () => {
      const h = makeHeaders({
        "anthropic-ratelimit-unified-5h-utilization": "0.1",
        "anthropic-ratelimit-unified-5h-reset": "1764554400",
        "anthropic-ratelimit-unified-5h-status": "allowed",
        "anthropic-ratelimit-unified-representative-claim": "bogus_window",
      });

      const snapshot = parseRateLimitHeaders(h);
      expect(snapshot?.representativeClaim).toBeNull();
    });
  });

  describe("saveSnapshot / getLatestSnapshot", () => {
    test("round-trips a snapshot through memory + SQLite", () => {
      const snapshot = {
        capturedAt: 1_770_000_000_000,
        overallStatus: "allowed",
        representativeClaim: "five_hour" as const,
        fiveHour: { utilization: 0.25, resetAt: 1_770_018_000_000, status: "allowed" },
        weekly: { utilization: 0.7, resetAt: 1_770_604_800_000, status: "allowed" },
        fallbackPercentage: 0.5,
        overageStatus: null,
      };

      saveSnapshot(snapshot);
      clearSnapshotCache(); // force read from DB

      const loaded = getLatestSnapshot();
      expect(loaded).toEqual(snapshot);
    });

    test("overwrites the previous snapshot on a second save", () => {
      const first = {
        capturedAt: 1_000_000,
        overallStatus: "allowed",
        representativeClaim: null,
        fiveHour: { utilization: 0.1, resetAt: 2_000_000, status: "allowed" },
        weekly: null,
        fallbackPercentage: null,
        overageStatus: null,
      };
      const second = { ...first, capturedAt: 3_000_000 };

      saveSnapshot(first);
      saveSnapshot(second);
      clearSnapshotCache();

      const loaded = getLatestSnapshot();
      expect(loaded?.capturedAt).toBe(3_000_000);
      const countRow = testDb.query("SELECT COUNT(*) as n FROM plan_usage_snapshot").get() as {
        n: number;
      };
      expect(countRow.n).toBe(1);
    });

    test("returns null when the table is empty", () => {
      clearSnapshotCache();
      expect(getLatestSnapshot()).toBeNull();
    });
  });
} else {
  test.skip("plan-usage-snapshot (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
