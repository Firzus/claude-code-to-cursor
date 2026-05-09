import "server-only";

import { api } from "../../convex/_generated/api";
import { convex } from "./convex";
import { toErrorMessage } from "./error-utils";
import { logger } from "./logger";

export interface RateLimitWindow {
  /** Fraction 0.0 – 1.0+ (may exceed 1 briefly). */
  utilization: number;
  /** Unix epoch ms when the window rolls over. */
  resetAt: number;
  /** `allowed` / `allowed_warning` / `warning` / `rate_limited` / `rejected` / ... */
  status: string;
}

export interface RateLimitSnapshot {
  capturedAt: number;
  overallStatus: string | null;
  representativeClaim: "five_hour" | "seven_day" | null;
  fiveHour: RateLimitWindow | null;
  weekly: RateLimitWindow | null;
  fallbackPercentage: number | null;
  overageStatus: string | null;
}

// In-memory cache to avoid hitting Convex on every /plan-usage GET.
// The latest snapshot we've parsed wins; refreshed on every upstream
// API response (so always within seconds of the truth).
let cachedSnapshot: RateLimitSnapshot | null = null;

// Throttle Convex writes — the API hits ~once per request and almost
// never changes between two adjacent calls.
const PERSIST_THROTTLE_MS = 5000;
let lastPersistedAt = 0;
let lastPersistedStatus: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: RateLimitSnapshot | null = null;

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

function parseUtilization(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function parseResetEpoch(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function parseRepresentativeClaim(value: string | null): "five_hour" | "seven_day" | null {
  if (value === "five_hour" || value === "seven_day") return value;
  return null;
}

function parseWindow(headers: Headers, prefix: "5h" | "7d"): RateLimitWindow | null {
  const utilization = parseUtilization(
    headers.get(`anthropic-ratelimit-unified-${prefix}-utilization`),
  );
  const resetAt = parseResetEpoch(headers.get(`anthropic-ratelimit-unified-${prefix}-reset`));
  const status = headers.get(`anthropic-ratelimit-unified-${prefix}-status`);

  if (utilization === null || resetAt === null) return null;
  return {
    utilization,
    resetAt,
    status: status ?? "unknown",
  };
}

export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot | null {
  const fiveHour = parseWindow(headers, "5h");
  const weekly = parseWindow(headers, "7d");
  if (!fiveHour && !weekly) return null;

  return {
    capturedAt: Date.now(),
    overallStatus: headers.get("anthropic-ratelimit-unified-status"),
    representativeClaim: parseRepresentativeClaim(
      headers.get("anthropic-ratelimit-unified-representative-claim"),
    ),
    fiveHour,
    weekly,
    fallbackPercentage: parseUtilization(
      headers.get("anthropic-ratelimit-unified-fallback-percentage"),
    ),
    overageStatus: headers.get("anthropic-ratelimit-unified-overage-status"),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistSnapshotNow(snapshot: RateLimitSnapshot): void {
  convex
    .mutation(api.planUsageSnapshot.save, snapshot)
    .then(() => {
      lastPersistedAt = Date.now();
      lastPersistedStatus = snapshot.overallStatus;
      pendingPersist = null;
    })
    .catch((err) => {
      logger.verbose(`[plan-usage] failed to persist snapshot: ${toErrorMessage(err)}`);
    });
}

export function saveSnapshot(snapshot: RateLimitSnapshot): void {
  cachedSnapshot = snapshot;

  const now = Date.now();
  const statusChanged = snapshot.overallStatus !== lastPersistedStatus;
  const intervalElapsed = now - lastPersistedAt >= PERSIST_THROTTLE_MS;

  if (statusChanged || intervalElapsed) {
    persistSnapshotNow(snapshot);
    return;
  }

  pendingPersist = snapshot;
  if (persistTimer) return;
  const delay = PERSIST_THROTTLE_MS - (now - lastPersistedAt);
  persistTimer = setTimeout(
    () => {
      persistTimer = null;
      if (pendingPersist) persistSnapshotNow(pendingPersist);
    },
    Math.max(0, delay),
  );
}

export function flushPendingSnapshot(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingPersist) persistSnapshotNow(pendingPersist);
}

export async function getLatestSnapshot(): Promise<RateLimitSnapshot | null> {
  if (cachedSnapshot) return cachedSnapshot;

  try {
    const stored = await convex.query(api.planUsageSnapshot.getLatest, {});
    if (!stored) return null;
    cachedSnapshot = stored as RateLimitSnapshot;
    return cachedSnapshot;
  } catch (error) {
    logger.warn(`[plan-usage] failed to load snapshot: ${toErrorMessage(error)}`);
    return null;
  }
}

