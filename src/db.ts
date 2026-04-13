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
import type { RoutingDecision } from "./routing-policy";

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
        database.run(m.sql);
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
      source TEXT NOT NULL CHECK (source IN ('claude_code', 'error')),
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

  console.log(`✓ Database initialized at ${DB_PATH}`);
}

type RequestSource = "claude_code" | "error";

export interface RequestShapeMetrics {
  route: "anthropic" | "openai";
  messageCount: number;
  lastMsgRole: string | null;
  lastMsgHasToolResult: boolean;
  toolUseCount: number;
  toolResultCount: number;
  toolDefsCount: number;
  toolDefsHash: string | null;
  clientSystemHash: string | null;
  clientReasoningEffort: string | null;
}

interface RequestRecord {
  model: string;
  source: RequestSource;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  stream: boolean;
  latencyMs?: number;
  error?: string;
  shape?: RequestShapeMetrics;
  decision?: RoutingDecision;
}

/**
 * Record a request in the database
 */
export function recordRequest(record: RequestRecord): void {
  const database = getDb();
  const shape = record.shape;
  const decision = record.decision;

  database.run(
    `INSERT INTO requests (
       timestamp, model, source, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, stream, latency_ms, error,
       route, message_count, last_msg_role, last_msg_has_tool_result,
       tool_use_count, tool_result_count, tool_defs_count, tool_defs_hash,
       client_system_hash, client_reasoning_effort,
       applied_model, applied_thinking_effort, routing_policy
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      shape?.route ?? null,
      shape?.messageCount ?? null,
      shape?.lastMsgRole ?? null,
      shape ? (shape.lastMsgHasToolResult ? 1 : 0) : null,
      shape?.toolUseCount ?? null,
      shape?.toolResultCount ?? null,
      shape?.toolDefsCount ?? null,
      shape?.toolDefsHash ?? null,
      shape?.clientSystemHash ?? null,
      shape?.clientReasoningEffort ?? null,
      decision?.model ?? null,
      decision?.effort ?? null,
      decision?.policy ?? null,
    ],
  );
}

interface AnalyticsSummary {
  totalRequests: number;
  claudeCodeRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  cacheHitRate: number;
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
        SUM(cache_creation_tokens) as total_cache_creation_tokens
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
  };

  const cacheRead = totals.total_cache_read_tokens || 0;
  const cacheCreation = totals.total_cache_creation_tokens || 0;
  const totalInput = totals.total_input_tokens || 0;
  const allInput = totalInput + cacheRead + cacheCreation;

  return {
    totalRequests: totals.total_requests || 0,
    claudeCodeRequests: totals.claude_code_requests || 0,
    errorRequests: totals.error_requests || 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totals.total_output_tokens || 0,
    totalCacheReadTokens: cacheRead,
    totalCacheCreationTokens: cacheCreation,
    cacheHitRate: allInput > 0 ? cacheRead / allInput : 0,
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
    stream: boolean;
    latencyMs: number | null;
    error: string | null;
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
              cache_read_tokens, cache_creation_tokens, stream, latency_ms, error
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
    stream: number;
    latency_ms: number | null;
    error: string | null;
  }>;

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
      stream: row.stream === 1,
      latencyMs: row.latency_ms,
      error: row.error,
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

export function saveModelSettings(settings: ModelSettings): void {
  saveModelSettingsToDb(getDb(), settings);
}
