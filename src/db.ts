/**
 * SQLite database for analytics and rate limiting
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
      source TEXT NOT NULL CHECK (source IN ('claude_code', 'api_key', 'error')),
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

  // Budget settings table
  database.run(`
    CREATE TABLE IF NOT EXISTS budget_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hourly_limit REAL,
      daily_limit REAL,
      weekly_limit REAL,
      monthly_limit REAL,
      enabled INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Insert default budget settings if not exists
  database.run(`
    INSERT OR IGNORE INTO budget_settings (id, enabled) VALUES (1, 0)
  `);

  console.log(`✓ Database initialized at ${DB_PATH}`);
}

export type RequestSource = "claude_code" | "api_key" | "error";

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

export interface BudgetSettings {
  hourlyLimit: number | null;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  monthlyLimit: number | null;
  enabled: boolean;
}

/**
 * Get current budget settings
 */
export function getBudgetSettings(): BudgetSettings {
  const database = getDb();
  const row = database
    .query(`SELECT * FROM budget_settings WHERE id = 1`)
    .get() as {
    hourly_limit: number | null;
    daily_limit: number | null;
    weekly_limit: number | null;
    monthly_limit: number | null;
    enabled: number;
  };

  return {
    hourlyLimit: row.hourly_limit,
    dailyLimit: row.daily_limit,
    weeklyLimit: row.weekly_limit,
    monthlyLimit: row.monthly_limit,
    enabled: row.enabled === 1,
  };
}

/**
 * Update budget settings
 */
export function updateBudgetSettings(settings: Partial<BudgetSettings>): void {
  const database = getDb();
  const current = getBudgetSettings();

  database.run(
    `UPDATE budget_settings SET
      hourly_limit = ?,
      daily_limit = ?,
      weekly_limit = ?,
      monthly_limit = ?,
      enabled = ?
     WHERE id = 1`,
    [
      settings.hourlyLimit ?? current.hourlyLimit,
      settings.dailyLimit ?? current.dailyLimit,
      settings.weeklyLimit ?? current.weeklyLimit,
      settings.monthlyLimit ?? current.monthlyLimit,
      settings.enabled ?? current.enabled ? 1 : 0,
    ]
  );
}

/**
 * Get estimated cost for a time period (only API key requests - Claude Code is "free")
 */
export function getApiKeyCostSince(since: number): number {
  const database = getDb();
  const result = database
    .query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as total FROM requests WHERE source = 'api_key' AND timestamp >= ?`
    )
    .get(since) as { total: number };
  return result.total;
}

/**
 * Check if budget allows a request (returns null if allowed, error message if not)
 */
export function checkBudget(): string | null {
  const settings = getBudgetSettings();
  if (!settings.enabled) return null;

  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  if (settings.hourlyLimit !== null) {
    const hourlySpend = getApiKeyCostSince(hourAgo);
    if (hourlySpend >= settings.hourlyLimit) {
      return `Hourly budget exceeded: $${hourlySpend.toFixed(
        2
      )} / $${settings.hourlyLimit.toFixed(2)}`;
    }
  }

  if (settings.dailyLimit !== null) {
    const dailySpend = getApiKeyCostSince(dayAgo);
    if (dailySpend >= settings.dailyLimit) {
      return `Daily budget exceeded: $${dailySpend.toFixed(
        2
      )} / $${settings.dailyLimit.toFixed(2)}`;
    }
  }

  if (settings.weeklyLimit !== null) {
    const weeklySpend = getApiKeyCostSince(weekAgo);
    if (weeklySpend >= settings.weeklyLimit) {
      return `Weekly budget exceeded: $${weeklySpend.toFixed(
        2
      )} / $${settings.weeklyLimit.toFixed(2)}`;
    }
  }

  if (settings.monthlyLimit !== null) {
    const monthlySpend = getApiKeyCostSince(monthAgo);
    if (monthlySpend >= settings.monthlyLimit) {
      return `Monthly budget exceeded: $${monthlySpend.toFixed(
        2
      )} / $${settings.monthlyLimit.toFixed(2)}`;
    }
  }

  return null;
}

export interface AnalyticsSummary {
  totalRequests: number;
  claudeCodeRequests: number;
  apiKeyRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedApiKeyCost: number;
  estimatedSavings: number; // Cost that would have been incurred if Claude Code requests used API key
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
        SUM(CASE WHEN source = 'api_key' THEN 1 ELSE 0 END) as api_key_requests,
        SUM(CASE WHEN source = 'error' THEN 1 ELSE 0 END) as error_requests,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(CASE WHEN source = 'api_key' THEN estimated_cost ELSE 0 END) as api_key_cost,
        SUM(CASE WHEN source = 'claude_code' THEN estimated_cost ELSE 0 END) as claude_code_cost
       FROM requests
       WHERE timestamp >= ? AND timestamp <= ?`
    )
    .get(since, until) as {
    total_requests: number;
    claude_code_requests: number;
    api_key_requests: number;
    error_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    api_key_cost: number;
    claude_code_cost: number;
  };

  return {
    totalRequests: totals.total_requests || 0,
    claudeCodeRequests: totals.claude_code_requests || 0,
    apiKeyRequests: totals.api_key_requests || 0,
    errorRequests: totals.error_requests || 0,
    totalInputTokens: totals.total_input_tokens || 0,
    totalOutputTokens: totals.total_output_tokens || 0,
    estimatedApiKeyCost: totals.api_key_cost || 0,
    estimatedSavings: totals.claude_code_cost || 0, // What we would have paid
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
