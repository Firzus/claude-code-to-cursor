/**
 * SQLite database for analytics
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { calculateCost } from "./pricing";

const DB_PATH =
  process.env.CCPROXY_DB_PATH || join(process.cwd(), "ccproxy.db");

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = getDb();

  // Requests table - tracks every request
  database.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      model TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('claude_code', 'error')),
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      stream INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      error TEXT
    )
  `);

  // Create indexes for common queries
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`
  );
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_requests_source ON requests(source)`
  );

  console.log(`✓ Database initialized at ${DB_PATH}`);
}

export type RequestSource = "claude_code" | "error";

export interface RequestRecord {
  model: string;
  source: RequestSource;
  inputTokens: number;
  outputTokens: number;
  stream: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Record a request in the database
 */
export function recordRequest(record: RequestRecord): void {
  const database = getDb();
  const estimatedCost = calculateCost(
    record.model,
    record.inputTokens,
    record.outputTokens
  );

  database.run(
    `INSERT INTO requests (timestamp, model, source, input_tokens, output_tokens, estimated_cost, stream, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Date.now(),
      record.model,
      record.source,
      record.inputTokens,
      record.outputTokens,
      estimatedCost,
      record.stream ? 1 : 0,
      record.latencyMs ?? null,
      record.error ?? null,
    ]
  );
}

export interface AnalyticsSummary {
  totalRequests: number;
  claudeCodeRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
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
        SUM(estimated_cost) as total_cost
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ?`
    )
    .get(since, until) as {
      total_requests: number;
      claude_code_requests: number;
      error_requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost: number;
    };

  return {
    totalRequests: totals.total_requests || 0,
    claudeCodeRequests: totals.claude_code_requests || 0,
    errorRequests: totals.error_requests || 0,
    totalInputTokens: totals.total_input_tokens || 0,
    totalOutputTokens: totals.total_output_tokens || 0,
    estimatedCost: totals.total_cost || 0,
    periodStart: since,
    periodEnd: until,
  };
}

/**
 * Get recent requests
 */
export function getRecentRequests(limit: number = 100): Array<{
  id: number;
  timestamp: number;
  model: string;
  source: RequestSource;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  stream: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  const database = getDb();
  const rows = database
    .query(
      `SELECT id, timestamp, model, source, input_tokens, output_tokens, estimated_cost, stream, latency_ms, error
       FROM requests ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit) as Array<{
      id: number;
      timestamp: number;
      model: string;
      source: RequestSource;
      input_tokens: number;
      output_tokens: number;
      estimated_cost: number;
      stream: number;
      latency_ms: number | null;
      error: string | null;
    }>;

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    model: row.model,
    source: row.source,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCost: row.estimated_cost,
    stream: row.stream === 1,
    latencyMs: row.latency_ms,
    error: row.error,
  }));
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
