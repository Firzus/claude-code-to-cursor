/**
 * SQLite database for analytics
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import {
  getModelSettingsFromDb,
  initModelSettingsSchema,
  saveModelSettingsToDb,
} from "./model-settings-store";
import type { ModelSettings } from "./model-settings";

const DB_PATH =
  process.env.CCPROXY_DB_PATH || join(process.cwd(), "ccproxy.db");

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database) {
  // Requests table - tracks every request
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

  // Migration: add cache token columns
  try { database.run("ALTER TABLE requests ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0"); } catch { }
  try { database.run("ALTER TABLE requests ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0"); } catch { }

  // Create indexes for common queries
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`
  );
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_requests_source ON requests(source)`
  );

  initModelSettingsSchema(database);

  console.log(`✓ Database initialized at ${DB_PATH}`);
}

type RequestSource = "claude_code" | "error";

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
}

/**
 * Record a request in the database
 */
export function recordRequest(record: RequestRecord): void {
  const database = getDb();

  database.run(
    `INSERT INTO requests (timestamp, model, source, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, stream, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ]
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
export function getAnalytics(
  since: number,
  until: number = Date.now()
): AnalyticsSummary {
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
       WHERE timestamp >= ? AND timestamp <= ?`
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
  offset: number = 0
): {
  requests: Array<{
    id: number;
    timestamp: number;
    model: string;
    source: RequestSource;
    inputTokens: number;
    outputTokens: number;
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
      `SELECT id, timestamp, model, source, input_tokens, output_tokens, stream, latency_ms, error
       FROM requests WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(since, limit, offset) as Array<{
      id: number;
      timestamp: number;
      model: string;
      source: RequestSource;
      input_tokens: number;
      output_tokens: number;
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
      error_count: number;
    }>;

  const filledBuckets: TimelineBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    const ts = since + i * bucketSize;
    const match = rows.find(
      (r) => r.bucket_ts >= ts && r.bucket_ts < ts + bucketSize,
    );
    filledBuckets.push({
      timestamp: ts,
      requests: match?.requests ?? 0,
      inputTokens: match?.input_tokens ?? 0,
      outputTokens: match?.output_tokens ?? 0,
      cacheReadTokens: match?.cache_read_tokens ?? 0,
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
  const countResult = database
    .query(`SELECT COUNT(*) as count FROM requests`)
    .get() as { count: number };
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
