import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ModelSettings } from "../model-settings";
import type { RateLimitSnapshot } from "../plan-usage-snapshot";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

type WindowRow = { tokens: number; oldestTimestamp: number | null };

interface PlanUsageBody {
  plan: "pro" | "max5x" | "max20x";
  source: "anthropic" | "estimated" | "none";
  capturedAt: number | null;
  representativeClaim: "five_hour" | "seven_day" | null;
  quotas: { fiveHourTokens: number; weeklyTokens: number };
  usage: {
    fiveHour: {
      percent: number;
      resetAt: number;
      tokens?: number;
      limit?: number;
      status?: string;
    };
    weekly: { percent: number; resetAt: number; tokens?: number; limit?: number; status?: string };
  };
}

if (!SKIP) {
  let currentSettings: ModelSettings = {
    selectedModel: "claude-opus-4-7",
    thinkingEnabled: true,
    thinkingEffort: "high",
    subscriptionPlan: "max20x",
  };

  const windowQueue: WindowRow[] = [];
  let currentSnapshot: RateLimitSnapshot | null = null;

  mock.module("../db", () => ({
    getModelSettings: () => currentSettings,
    saveModelSettings: () => {},
    getPlanWindowUsage: () => {
      const next = windowQueue.shift();
      if (!next) throw new Error("no more fake window rows queued");
      return next;
    },
  }));

  mock.module("../plan-usage-snapshot", () => ({
    getLatestSnapshot: () => currentSnapshot,
  }));

  const { handlePlanUsage } = await import("./plan-usage");

  beforeEach(() => {
    windowQueue.length = 0;
    currentSnapshot = null;
    currentSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };
  });

  describe("handlePlanUsage", () => {
    test('uses a fresh snapshot → source: "anthropic"', async () => {
      const now = Date.now();
      currentSnapshot = {
        capturedAt: now - 30_000,
        overallStatus: "allowed",
        representativeClaim: "five_hour",
        fiveHour: { utilization: 0.0184, resetAt: now + 3 * 60 * 60 * 1000, status: "allowed" },
        weekly: { utilization: 0.48, resetAt: now + 18 * 60 * 60 * 1000, status: "allowed" },
        fallbackPercentage: 0.2,
        overageStatus: null,
      };

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;

      expect(body.source).toBe("anthropic");
      expect(body.capturedAt).toBe(now - 30_000);
      expect(body.representativeClaim).toBe("five_hour");
      expect(body.usage.fiveHour.percent).toBeCloseTo(1.84, 1);
      expect(body.usage.fiveHour.status).toBe("allowed");
      expect(body.usage.weekly.percent).toBeCloseTo(48, 1);
      expect(body.usage.fiveHour.tokens).toBeUndefined();
      expect(body.usage.fiveHour.limit).toBeUndefined();
    });

    test("falls back to estimated when the snapshot is stale (>5h old)", async () => {
      const now = Date.now();
      currentSnapshot = {
        capturedAt: now - 6 * 60 * 60 * 1000,
        overallStatus: "allowed",
        representativeClaim: "five_hour",
        fiveHour: { utilization: 0.5, resetAt: now - 60_000, status: "allowed" },
        weekly: { utilization: 0.5, resetAt: now + 60_000, status: "allowed" },
        fallbackPercentage: null,
        overageStatus: null,
      };
      windowQueue.push({ tokens: 22_000, oldestTimestamp: now - 60_000 });
      windowQueue.push({ tokens: 3_000_000, oldestTimestamp: now - 3600_000 });

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;

      expect(body.source).toBe("estimated");
      expect(body.capturedAt).toBeNull();
      expect(body.usage.fiveHour.tokens).toBe(22_000);
      expect(body.usage.fiveHour.limit).toBe(220_000);
      expect(body.usage.fiveHour.percent).toBeCloseTo(10, 1);
    });

    test('no snapshot and no local requests → source: "none"', async () => {
      windowQueue.push({ tokens: 0, oldestTimestamp: null });
      windowQueue.push({ tokens: 0, oldestTimestamp: null });

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;

      expect(body.source).toBe("none");
      expect(body.capturedAt).toBeNull();
      expect(body.usage.fiveHour.percent).toBe(0);
      expect(body.usage.weekly.percent).toBe(0);
    });

    test('no snapshot but local requests exist → source: "estimated"', async () => {
      windowQueue.push({ tokens: 11_000, oldestTimestamp: Date.now() - 60_000 });
      windowQueue.push({ tokens: 100_000, oldestTimestamp: Date.now() - 3600_000 });

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;

      expect(body.source).toBe("estimated");
      expect(body.usage.fiveHour.tokens).toBe(11_000);
    });

    test("returns the current plan quotas even in anthropic mode", async () => {
      currentSettings = { ...currentSettings, subscriptionPlan: "pro" };
      const now = Date.now();
      currentSnapshot = {
        capturedAt: now,
        overallStatus: "allowed",
        representativeClaim: null,
        fiveHour: { utilization: 0.25, resetAt: now + 60_000, status: "allowed" },
        weekly: { utilization: 0.1, resetAt: now + 60_000, status: "allowed" },
        fallbackPercentage: null,
        overageStatus: null,
      };

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;

      expect(body.plan).toBe("pro");
      expect(body.quotas).toEqual({ fiveHourTokens: 44_000, weeklyTokens: 1_500_000 });
    });

    test("clamps utilization over 100%", async () => {
      const now = Date.now();
      currentSnapshot = {
        capturedAt: now,
        overallStatus: "rate_limited",
        representativeClaim: "five_hour",
        fiveHour: { utilization: 1.2, resetAt: now + 60_000, status: "rate_limited" },
        weekly: { utilization: 0.4, resetAt: now + 60_000, status: "allowed" },
        fallbackPercentage: null,
        overageStatus: null,
      };

      const res = handlePlanUsage();
      const body = (await res.json()) as PlanUsageBody;
      expect(body.usage.fiveHour.percent).toBe(100);
      expect(body.usage.fiveHour.status).toBe("rate_limited");
    });
  });
} else {
  test.skip("handlePlanUsage (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
