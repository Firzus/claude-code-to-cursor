/**
 * Captures Anthropic's `anthropic-ratelimit-unified-*` response headers and
 * exposes them as the source of truth for plan-usage display.
 *
 * These headers are returned on every OAuth API response (200 and 4xx) and
 * mirror exactly what the Claude.ai /usage page and Claude Code CLI show.
 *
 * Reference:
 *   https://github.com/anthropics/claude-code/issues/12829
 *   https://github.com/Fiattarone/claude-usage-proxy
 */

import type { Database } from "bun:sqlite";
import { getDb } from "./db";
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

const SNAPSHOT_TABLE = "plan_usage_snapshot";

// In-memory cache — the most recent snapshot we've seen. Persisted to SQLite
// so we survive restarts, but memory reads avoid a DB hit on every /plan-usage.
let cachedSnapshot: RateLimitSnapshot | null = null;
let cachedFromDb = false;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initPlanUsageSnapshotSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      captured_at INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

function parseUtilization(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Anthropic sends reset timestamps as Unix epoch seconds (string). Convert to
 * milliseconds for JS Date compatibility. Returns null for missing/invalid.
 */
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

/**
 * Extract the plan-usage snapshot from an Anthropic API response's headers.
 * Returns null when no relevant headers are present (e.g. non-OAuth responses
 * or upstream network errors).
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot | null {
  const fiveHour = parseWindow(headers, "5h");
  const weekly = parseWindow(headers, "7d");

  // If neither window is present, the response didn't carry the unified
  // ratelimit headers at all — signal "nothing to capture".
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

export function saveSnapshot(snapshot: RateLimitSnapshot): void {
  cachedSnapshot = snapshot;
  cachedFromDb = true;
  try {
    const database = getDb();
    database.run(
      `INSERT INTO ${SNAPSHOT_TABLE} (id, captured_at, data)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET captured_at = excluded.captured_at, data = excluded.data`,
      [snapshot.capturedAt, JSON.stringify(snapshot)],
    );
  } catch (error) {
    logger.verbose(`[plan-usage] failed to persist snapshot: ${String(error)}`);
  }
}

export function getLatestSnapshot(): RateLimitSnapshot | null {
  if (cachedFromDb) return cachedSnapshot;

  try {
    const database = getDb();
    const row = database.query(`SELECT data FROM ${SNAPSHOT_TABLE} WHERE id = 1`).get() as {
      data: string;
    } | null;
    cachedFromDb = true;
    if (!row) return null;
    cachedSnapshot = JSON.parse(row.data) as RateLimitSnapshot;
    return cachedSnapshot;
  } catch (error) {
    logger.verbose(`[plan-usage] failed to load snapshot: ${String(error)}`);
    cachedFromDb = true;
    return null;
  }
}

/** Clear both memory and persisted cache — useful for tests. */
export function clearSnapshotCache(): void {
  cachedSnapshot = null;
  cachedFromDb = false;
}
