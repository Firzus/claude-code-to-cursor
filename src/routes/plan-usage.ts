import { getModelSettings, getPlanWindowUsage } from "../db";
import { getPlanQuotas, type SubscriptionPlan } from "../model-settings";
import { getLatestSnapshot, type RateLimitSnapshot } from "../plan-usage-snapshot";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Max age for a header snapshot to be trusted as "live" data. */
const SNAPSHOT_FRESH_MS = FIVE_HOURS_MS;

export interface PlanUsageWindow {
  percent: number;
  resetAt: number;
  /** Only present in estimated mode — we don't know the real token figures
   *  when reading from Anthropic's utilization headers. */
  tokens?: number;
  limit?: number;
  status?: string;
}

export type PlanUsageSource = "anthropic" | "estimated" | "none";

export interface PlanUsageResponse {
  plan: SubscriptionPlan;
  source: PlanUsageSource;
  /** `Date.now()` when the authoritative snapshot was captured. Null unless
   *  source === "anthropic". */
  capturedAt: number | null;
  representativeClaim: "five_hour" | "seven_day" | null;
  usage: {
    fiveHour: PlanUsageWindow;
    weekly: PlanUsageWindow;
  };
  quotas: { fiveHourTokens: number; weeklyTokens: number };
}

function windowFromSnapshot(
  snapshotWindow: RateLimitSnapshot["fiveHour"] | RateLimitSnapshot["weekly"],
  fallbackWindowMs: number,
  now: number,
): PlanUsageWindow {
  if (!snapshotWindow) {
    return { percent: 0, resetAt: now + fallbackWindowMs, status: "unknown" };
  }
  return {
    percent: Math.min(100, Math.max(0, snapshotWindow.utilization * 100)),
    resetAt: snapshotWindow.resetAt,
    status: snapshotWindow.status,
  };
}

function estimatedWindow(
  sinceMs: number,
  windowMs: number,
  limit: number,
  now: number,
): PlanUsageWindow {
  const { tokens, oldestTimestamp } = getPlanWindowUsage(sinceMs);
  const resetAt = oldestTimestamp !== null ? oldestTimestamp + windowMs : now + windowMs;
  const percent = limit > 0 ? Math.min(100, (tokens / limit) * 100) : 0;
  return { tokens, limit, percent, resetAt };
}

/**
 * GET /api/plan-usage
 *
 * Returns Anthropic's authoritative 5h/7d utilization when a recent response
 * header snapshot is available. Falls back to a local token-based estimate
 * when no fresh snapshot exists (cold start, no OAuth traffic yet).
 */
export function handlePlanUsage(): Response {
  const settings = getModelSettings();
  const quotas = getPlanQuotas(settings.subscriptionPlan);
  const now = Date.now();

  const snapshot = getLatestSnapshot();
  const snapshotFresh = snapshot !== null && now - snapshot.capturedAt < SNAPSHOT_FRESH_MS;

  if (snapshotFresh && snapshot) {
    const body: PlanUsageResponse = {
      plan: settings.subscriptionPlan,
      source: "anthropic",
      capturedAt: snapshot.capturedAt,
      representativeClaim: snapshot.representativeClaim,
      usage: {
        fiveHour: windowFromSnapshot(snapshot.fiveHour, FIVE_HOURS_MS, now),
        weekly: windowFromSnapshot(snapshot.weekly, SEVEN_DAYS_MS, now),
      },
      quotas,
    };
    return Response.json(body);
  }

  // Fallback: local estimate based on stored request tokens.
  const fiveHour = estimatedWindow(now - FIVE_HOURS_MS, FIVE_HOURS_MS, quotas.fiveHourTokens, now);
  const weekly = estimatedWindow(now - SEVEN_DAYS_MS, SEVEN_DAYS_MS, quotas.weeklyTokens, now);

  // If no snapshot has ever been captured AND no local requests were counted,
  // signal "no data" so the UI can show a waiting state instead of 0%.
  const noLocalData = fiveHour.tokens === 0 && weekly.tokens === 0;
  const source: PlanUsageSource = snapshot === null && noLocalData ? "none" : "estimated";

  const body: PlanUsageResponse = {
    plan: settings.subscriptionPlan,
    source,
    capturedAt: null,
    representativeClaim: null,
    usage: { fiveHour, weekly },
    quotas,
  };
  return Response.json(body);
}
