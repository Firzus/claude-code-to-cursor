/**
 * SQLite database for analytics
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import type { ModelSettings } from "./model-settings";
import {
  getModelSettingsFromDb,
  initModelSettingsSchema,
  saveModelSettingsToDb,
} from "./model-settings-store";
import { initPlanUsageSnapshotSchema } from "./plan-usage-snapshot";
import type { RoutingDecision } from "./routing-policy";
import { checkForStuckLoop } from "./stuck-loop-detector";
import type { RequestShapeMetrics } from "./types";

const DB_PATH = process.env.CCTC_DB_PATH || join(process.cwd(), "cctc.db");

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
}

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: "ALTER TABLE requests ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0",
  },
  {
    version: 2,
    sql: "ALTER TABLE requests ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0",
  },
  { version: 3, sql: "ALTER TABLE requests ADD COLUMN route TEXT" },
  { version: 4, sql: "ALTER TABLE requests ADD COLUMN message_count INTEGER" },
  { version: 5, sql: "ALTER TABLE requests ADD COLUMN last_msg_role TEXT" },
  { version: 6, sql: "ALTER TABLE requests ADD COLUMN last_msg_has_tool_result INTEGER" },
  { version: 7, sql: "ALTER TABLE requests ADD COLUMN tool_use_count INTEGER" },
  { version: 8, sql: "ALTER TABLE requests ADD COLUMN tool_result_count INTEGER" },
  { version: 9, sql: "ALTER TABLE requests ADD COLUMN tool_defs_count INTEGER" },
  { version: 10, sql: "ALTER TABLE requests ADD COLUMN tool_defs_hash TEXT" },
  { version: 11, sql: "ALTER TABLE requests ADD COLUMN client_system_hash TEXT" },
  { version: 12, sql: "ALTER TABLE requests ADD COLUMN client_reasoning_effort TEXT" },
  { version: 13, sql: "ALTER TABLE requests ADD COLUMN applied_model TEXT" },
  { version: 14, sql: "ALTER TABLE requests ADD COLUMN applied_thinking_effort TEXT" },
  { version: 15, sql: "ALTER TABLE requests ADD COLUMN routing_policy TEXT" },
  {
    version: 17,
    sql: "ALTER TABLE requests ADD COLUMN thinking_tokens INTEGER NOT NULL DEFAULT 0",
  },
  {
    version: 16,
    sql: `BEGIN;
CREATE TABLE requests_rebuilt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  model TEXT NOT NULL,
  source TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  stream INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  error TEXT,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  route TEXT,
  message_count INTEGER,
  last_msg_role TEXT,
  last_msg_has_tool_result INTEGER,
  tool_use_count INTEGER,
  tool_result_count INTEGER,
  tool_defs_count INTEGER,
  tool_defs_hash TEXT,
  client_system_hash TEXT,
  client_reasoning_effort TEXT,
  applied_model TEXT,
  applied_thinking_effort TEXT,
  routing_policy TEXT
);
INSERT INTO requests_rebuilt SELECT * FROM requests;
DROP TABLE requests;
ALTER TABLE requests_rebuilt RENAME TO requests;
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_requests_source ON requests(source);
COMMIT;`,
  },
];

function runMigrations(database: Database): void {
  database.run("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");

  const result = database.query("SELECT MAX(version) as v FROM schema_version").get() as {
    v: number | null;
  } | null;
  const current = result?.v ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      try {
        // exec supports multi-statement migrations (e.g. table rebuild)
        database.exec(m.sql);
      } catch {
        // Column may already exist from legacy try/catch migrations
      }
      database.run("INSERT INTO schema_version (version) VALUES (?)", [m.version]);
    }
  }
}

function initSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      model TEXT NOT NULL,
      source TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      stream INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      error TEXT
    )
  `);

  runMigrations(database);

  database.run(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_requests_source ON requests(source)`);

  initModelSettingsSchema(database);
  initPlanUsageSnapshotSchema(database);

  console.log(`✓ Database initialized at ${DB_PATH}`);
}

type RequestSource = "claude_code" | "error";

export type { RequestShapeMetrics };

interface RequestRecord {
  model: string;
  source: RequestSource;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Extended thinking tokens (stream estimate or API-reported when available). */
  thinkingTokens?: number;
  stream: boolean;
  latencyMs?: number;
  error?: string;
  shape?: RequestShapeMetrics;
  decision?: RoutingDecision;
  appliedModel?: string;
}

type SQLParam = string | number | null;

function shapeToParams(shape: RequestShapeMetrics | undefined): SQLParam[] {
  if (!shape) return [null, null, null, null, null, null, null, null, null, null];
  return [
    shape.route,
    shape.messageCount,
    shape.lastMsgRole,
    shape.lastMsgHasToolResult ? 1 : 0,
    shape.toolUseCount,
    shape.toolResultCount,
    shape.toolDefsCount,
    shape.toolDefsHash ?? null,
    shape.clientSystemHash ?? null,
    shape.clientReasoningEffort ?? null,
  ];
}

const INSERT_SQL = `INSERT INTO requests (
  timestamp, model, source, input_tokens, output_tokens,
  cache_read_tokens, cache_creation_tokens, stream, latency_ms, error,
  route, message_count, last_msg_role, last_msg_has_tool_result,
  tool_use_count, tool_result_count, tool_defs_count, tool_defs_hash,
  client_system_hash, client_reasoning_effort,
  applied_model, applied_thinking_effort, routing_policy,
  thinking_tokens
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Record a request in the database
 */
export function recordRequest(record: RequestRecord): void {
  const params: SQLParam[] = [
    Date.now(),
    record.model,
    record.source,
    record.inputTokens,
    record.outputTokens,
    record.cacheReadTokens ?? 0,
    record.cacheCreationTokens ?? 0,
    record.stream ? 1 : 0,
    record.latencyMs ?? null,
    record.error ?? null,
    ...shapeToParams(record.shape),
    record.appliedModel ?? null,
    record.decision?.effort ?? null,
    record.decision?.policy ?? null,
    record.thinkingTokens ?? 0,
  ];

  getDb().run(INSERT_SQL, params);

  if (record.source === "claude_code") {
    checkForStuckLoop({
      toolDefsHash: record.shape?.toolDefsHash ?? null,
      outputTokens: record.outputTokens,
      messageCount: record.shape?.messageCount ?? null,
    });
  }
}

interface AnalyticsSummary {
  totalRequests: number;
  claudeCodeRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalThinkingTokens: number;
  cacheHitRate: number;
  /** Heuristic: USD not billed thanks to cache reads vs full input price (see CACHE_READ_COST_RATIO). */
  cacheSavingsUsdEstimate: number;
  periodStart: number;
  periodEnd: number;
}

/**
 * Get analytics summary for a time period
 */
export function getAnalytics(since: number, until: number = Date.now()): AnalyticsSummary {
  const database = getDb();

  const totals = database
    .query(
      `SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN source = 'claude_code' THEN 1 ELSE 0 END) as claude_code_requests,
        SUM(CASE WHEN source = 'error' THEN 1 ELSE 0 END) as error_requests,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cache_read_tokens) as total_cache_read_tokens,
        SUM(cache_creation_tokens) as total_cache_creation_tokens,
        SUM(thinking_tokens) as total_thinking_tokens
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ?`,
    )
    .get(since, until) as {
    total_requests: number;
    claude_code_requests: number;
    error_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_read_tokens: number;
    total_cache_creation_tokens: number;
    total_thinking_tokens: number;
  };

  const cacheRead = totals.total_cache_read_tokens || 0;
  const cacheCreation = totals.total_cache_creation_tokens || 0;
  const totalInput = totals.total_input_tokens || 0;
  const allInput = totalInput + cacheRead + cacheCreation;
  const totalThinking = totals.total_thinking_tokens || 0;

  // Blended heuristic (USD per 1M tokens) for dashboard only — not billing truth.
  const INPUT_USD_PER_M = 15;
  const CACHE_READ_COST_RATIO = 0.1;
  const cacheSavingsUsdEstimate =
    (cacheRead * (1 - CACHE_READ_COST_RATIO) * INPUT_USD_PER_M) / 1_000_000;

  return {
    totalRequests: totals.total_requests || 0,
    claudeCodeRequests: totals.claude_code_requests || 0,
    errorRequests: totals.error_requests || 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totals.total_output_tokens || 0,
    totalCacheReadTokens: cacheRead,
    totalCacheCreationTokens: cacheCreation,
    totalThinkingTokens: totalThinking,
    cacheHitRate: allInput > 0 ? cacheRead / allInput : 0,
    cacheSavingsUsdEstimate,
    periodStart: since,
    periodEnd: until,
  };
}

/**
 * Get recent requests with pagination
 */
export function getRecentRequests(
  limit: number = 100,
  since: number = 0,
  offset: number = 0,
): {
  requests: Array<{
    id: number;
    timestamp: number;
    model: string;
    source: RequestSource;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    thinkingTokens: number;
    stream: boolean;
    latencyMs: number | null;
    error: string | null;
    route: string | null;
    messageCount: number | null;
    toolDefsCount: number | null;
    routingPolicy: string | null;
    appliedThinkingEffort: string | null;
    estimatedUsd: number;
  }>;
  total: number;
} {
  const database = getDb();

  const countResult = database
    .query(`SELECT COUNT(*) as count FROM requests WHERE timestamp >= ?`)
    .get(since) as { count: number };

  const rows = database
    .query(
      `SELECT id, timestamp, model, source, input_tokens, output_tokens,
              cache_read_tokens, cache_creation_tokens, thinking_tokens, stream, latency_ms, error,
              route, message_count, tool_defs_count, routing_policy, applied_thinking_effort
       FROM requests WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(since, limit, offset) as Array<{
    id: number;
    timestamp: number;
    model: string;
    source: RequestSource;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    thinking_tokens: number;
    stream: number;
    latency_ms: number | null;
    error: string | null;
    route: string | null;
    message_count: number | null;
    tool_defs_count: number | null;
    routing_policy: string | null;
    applied_thinking_effort: string | null;
  }>;

  const INPUT_USD_PER_M = 15;
  const OUTPUT_USD_PER_M = 75;
  const CACHE_READ_USD_PER_M = INPUT_USD_PER_M * 0.1;
  const CACHE_CREATION_USD_PER_M = INPUT_USD_PER_M * 1.25;

  return {
    total: countResult.count,
    requests: rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      thinkingTokens: row.thinking_tokens,
      stream: row.stream === 1,
      latencyMs: row.latency_ms,
      error: row.error,
      route: row.route,
      messageCount: row.message_count,
      toolDefsCount: row.tool_defs_count,
      routingPolicy: row.routing_policy,
      appliedThinkingEffort: row.applied_thinking_effort,
      estimatedUsd:
        (row.input_tokens * INPUT_USD_PER_M +
          row.output_tokens * OUTPUT_USD_PER_M +
          row.cache_read_tokens * CACHE_READ_USD_PER_M +
          row.cache_creation_tokens * CACHE_CREATION_USD_PER_M) /
        1_000_000,
    })),
  };
}

interface TimelineBucket {
  timestamp: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  errorCount: number;
}

export function getAnalyticsTimeline(
  since: number,
  until: number = Date.now(),
  buckets: number = 24,
): TimelineBucket[] {
  const database = getDb();
  const span = until - since;
  const bucketSize = Math.max(1, Math.floor(span / buckets));

  const rows = database
    .query(
      `SELECT
        (timestamp / ?) * ? as bucket_ts,
        COUNT(*) as requests,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_read_tokens) as cache_read_tokens,
        SUM(cache_creation_tokens) as cache_creation_tokens,
        SUM(CASE WHEN source = 'error' THEN 1 ELSE 0 END) as error_count
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ?
       GROUP BY bucket_ts
       ORDER BY bucket_ts ASC`,
    )
    .all(bucketSize, bucketSize, since, until) as Array<{
    bucket_ts: number;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    error_count: number;
  }>;

  const rowMap = new Map<number, (typeof rows)[number]>();
  for (const r of rows) rowMap.set(r.bucket_ts, r);

  const filledBuckets: TimelineBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    const ts = since + i * bucketSize;
    const match = rowMap.get(Math.floor(ts / bucketSize) * bucketSize);
    filledBuckets.push({
      timestamp: ts,
      requests: match?.requests ?? 0,
      inputTokens: match?.input_tokens ?? 0,
      outputTokens: match?.output_tokens ?? 0,
      cacheReadTokens: match?.cache_read_tokens ?? 0,
      cacheCreationTokens: match?.cache_creation_tokens ?? 0,
      errorCount: match?.error_count ?? 0,
    });
  }

  return filledBuckets;
}

/**
 * Reset all analytics data (clear requests table)
 */
export function resetAnalytics(): { deletedCount: number } {
  const database = getDb();
  const countResult = database.query(`SELECT COUNT(*) as count FROM requests`).get() as {
    count: number;
  };
  const deletedCount = countResult.count;

  database.run(`DELETE FROM requests`);

  // Reset auto-increment counter
  database.run(`DELETE FROM sqlite_sequence WHERE name = 'requests'`);

  console.log(`✓ Reset analytics: deleted ${deletedCount} records`);
  return { deletedCount };
}

export function getModelSettings(): ModelSettings {
  return getModelSettingsFromDb(getDb());
}

/** Token totals since UTC midnight (for budget visibility). */
export function getBudgetDaySummary(): {
  periodStart: number;
  periodEnd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  thinkingTokens: number;
  estimatedUsd: number;
} {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const periodStart = start.getTime();
  const periodEnd = Date.now();
  const database = getDb();

  const row = database
    .query(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
        COALESCE(SUM(thinking_tokens), 0) as thinking_tokens
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ?`,
    )
    .get(periodStart, periodEnd) as {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    thinking_tokens: number;
  };

  const inputTokens = row.input_tokens;
  const outputTokens = row.output_tokens;
  const cacheReadTokens = row.cache_read_tokens;
  const cacheCreationTokens = row.cache_creation_tokens;
  const thinkingTokens = row.thinking_tokens;

  const INPUT_USD_PER_M = 15;
  const OUTPUT_USD_PER_M = 75;
  const CACHE_READ_USD_PER_M = INPUT_USD_PER_M * 0.1;
  const CACHE_CREATION_USD_PER_M = INPUT_USD_PER_M * 1.25;

  const estimatedUsd =
    (inputTokens * INPUT_USD_PER_M) / 1_000_000 +
    (outputTokens * OUTPUT_USD_PER_M) / 1_000_000 +
    (cacheReadTokens * CACHE_READ_USD_PER_M) / 1_000_000 +
    (cacheCreationTokens * CACHE_CREATION_USD_PER_M) / 1_000_000;

  return {
    periodStart,
    periodEnd,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    thinkingTokens,
    estimatedUsd,
  };
}

export function saveModelSettings(settings: ModelSettings): void {
  saveModelSettingsToDb(getDb(), settings);
}

interface ErrorRecord {
  id: number;
  timestamp: number;
  model: string;
  error: string | null;
  latencyMs: number | null;
  route: string | null;
}

/**
 * Get recent failed requests (`source='error'`) for the errors card.
 * Returns the latest errors in the window, plus the total in the window and
 * the all-time total so the UI can hide the card on brand-new installs.
 */
export function getRecentErrors(
  limit: number = 10,
  since: number = 0,
  until: number = Date.now(),
): { errors: ErrorRecord[]; total: number; totalAllTime: number } {
  const database = getDb();

  const totalRow = database
    .query(
      `SELECT COUNT(*) as count FROM requests
       WHERE source = 'error' AND timestamp >= ? AND timestamp <= ?`,
    )
    .get(since, until) as { count: number };

  const totalAllTimeRow = database
    .query(`SELECT COUNT(*) as count FROM requests WHERE source = 'error'`)
    .get() as { count: number };

  const rows = database
    .query(
      `SELECT id, timestamp, model, error, latency_ms, route
       FROM requests
       WHERE source = 'error' AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(since, until, limit) as Array<{
    id: number;
    timestamp: number;
    model: string;
    error: string | null;
    latency_ms: number | null;
    route: string | null;
  }>;

  return {
    total: totalRow.count,
    totalAllTime: totalAllTimeRow.count,
    errors: rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      error: row.error,
      latencyMs: row.latency_ms,
      route: row.route,
    })),
  };
}

/**
 * Aggregate token usage for plan-tracking over a rolling window.
 *
 * Counts input + output + cache_creation at full weight, and cache_read at
 * 10% weight (matching the burn-rate the API docs describe for cached reads).
 * Only successful (non-error) requests are counted.
 */
export function getPlanWindowUsage(sinceMs: number): {
  tokens: number;
  oldestTimestamp: number | null;
} {
  const database = getDb();
  const now = Date.now();

  const row = database
    .query(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
        MIN(timestamp) as oldest_timestamp
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ? AND source = 'claude_code'`,
    )
    .get(sinceMs, now) as {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    oldest_timestamp: number | null;
  };

  const weightedTokens = Math.round(
    row.input_tokens + row.output_tokens + row.cache_creation_tokens + row.cache_read_tokens * 0.1,
  );

  return {
    tokens: weightedTokens,
    oldestTimestamp: row.oldest_timestamp ?? null,
  };
}
