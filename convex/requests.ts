import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CACHE_READ_COST_RATIO, INPUT_USD_PER_M, estimateRequestUsd } from "./pricing";

// Mirrors src/db.ts request shape. The mutation accepts a single record
// because the SQLite version's micro-batching (50 ms / 50 entries) was a
// workaround for raw fsync cost — Convex already coalesces writes.
export const recordRequest = mutation({
  args: {
    timestamp: v.number(),
    model: v.string(),
    source: v.union(v.literal("claude_code"), v.literal("error")),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    cacheCreationTokens: v.number(),
    thinkingTokens: v.number(),
    stream: v.boolean(),
    latencyMs: v.optional(v.union(v.number(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),

    route: v.optional(v.union(v.string(), v.null())),
    messageCount: v.optional(v.union(v.number(), v.null())),
    lastMsgRole: v.optional(v.union(v.string(), v.null())),
    lastMsgHasToolResult: v.optional(v.union(v.boolean(), v.null())),
    toolUseCount: v.optional(v.union(v.number(), v.null())),
    toolResultCount: v.optional(v.union(v.number(), v.null())),
    toolDefsCount: v.optional(v.union(v.number(), v.null())),
    toolDefsHash: v.optional(v.union(v.string(), v.null())),
    clientSystemHash: v.optional(v.union(v.string(), v.null())),
    clientReasoningEffort: v.optional(v.union(v.string(), v.null())),

    appliedModel: v.optional(v.union(v.string(), v.null())),
    appliedThinkingEffort: v.optional(v.union(v.string(), v.null())),
    routingPolicy: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("requests", args);
  },
});

// Aggregated summary over [since, until]. Mirrors getAnalytics() in src/db.ts.
// Convex doesn't expose SQL SUM, so we stream the rows in the time window
// and aggregate in JS. Cheap as long as the window is bounded; for very
// large ranges we'd want a denormalized rollup table.
//
// NB: queries must be deterministic. `Date.now()` would break Convex caching
// and reactivity, so callers pass `now` explicitly when `until` is unset.
export const getAnalytics = query({
  args: {
    since: v.number(),
    until: v.optional(v.number()),
    now: v.number(),
  },
  handler: async (ctx, { since, until, now }) => {
    const periodEnd = until ?? now;

    const rows = await ctx.db
      .query("requests")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since).lte("timestamp", periodEnd))
      .collect();

    let totalRequests = 0;
    let claudeCodeRequests = 0;
    let errorRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalThinkingTokens = 0;

    for (const row of rows) {
      totalRequests++;
      if (row.source === "claude_code") claudeCodeRequests++;
      else if (row.source === "error") errorRequests++;
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;
      totalCacheReadTokens += row.cacheReadTokens;
      totalCacheCreationTokens += row.cacheCreationTokens;
      totalThinkingTokens += row.thinkingTokens;
    }

    const allInput = totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens;
    const cacheSavingsUsdEstimate =
      (totalCacheReadTokens * (1 - CACHE_READ_COST_RATIO) * INPUT_USD_PER_M) / 1_000_000;

    return {
      totalRequests,
      claudeCodeRequests,
      errorRequests,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalThinkingTokens,
      cacheHitRate: allInput > 0 ? totalCacheReadTokens / allInput : 0,
      cacheSavingsUsdEstimate,
      periodStart: since,
      periodEnd,
    };
  },
});

// Paginated list. Convex supports proper paginate() but mirroring the
// (limit, offset, since) shape from src/db.ts so the route handler can
// stay 1:1. Skip semantics are honored by `take(limit + offset)` then
// slicing — fine for the dashboard's small page sizes (default 100).
export const getRecentRequests = query({
  args: {
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100, since = 0, offset = 0 }) => {
    const all = await ctx.db
      .query("requests")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .order("desc")
      .take(limit + offset);

    const sliced = all.slice(offset, offset + limit);

    // Total count (separate scan; Convex doesn't expose COUNT(*)).
    const total = (
      await ctx.db
        .query("requests")
        .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
        .collect()
    ).length;

    return {
      total,
      requests: sliced.map((row) => ({
        id: row._id,
        timestamp: row.timestamp,
        model: row.model,
        source: row.source,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        thinkingTokens: row.thinkingTokens,
        stream: row.stream,
        latencyMs: row.latencyMs ?? null,
        error: row.error ?? null,
        route: row.route ?? null,
        messageCount: row.messageCount ?? null,
        toolDefsCount: row.toolDefsCount ?? null,
        routingPolicy: row.routingPolicy ?? null,
        appliedThinkingEffort: row.appliedThinkingEffort ?? null,
        estimatedUsd: estimateRequestUsd(
          row.inputTokens,
          row.outputTokens,
          row.cacheReadTokens,
          row.cacheCreationTokens,
        ),
      })),
    };
  },
});

// Bucketed timeline. The SQL version uses `(ts / bucketSize) * bucketSize`
// to floor each timestamp to its bucket. We replicate that in JS.
export const getAnalyticsTimeline = query({
  args: {
    since: v.number(),
    until: v.optional(v.number()),
    buckets: v.optional(v.number()),
    now: v.number(),
  },
  handler: async (ctx, { since, until, buckets = 24, now }) => {
    const periodEnd = until ?? now;
    const span = periodEnd - since;
    const bucketSize = Math.max(1, Math.floor(span / buckets));

    const rows = await ctx.db
      .query("requests")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since).lte("timestamp", periodEnd))
      .collect();

    interface Acc {
      timestamp: number;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      errorCount: number;
    }

    const map = new Map<number, Acc>();
    for (const row of rows) {
      const bucketTs = Math.floor(row.timestamp / bucketSize) * bucketSize;
      let acc = map.get(bucketTs);
      if (!acc) {
        acc = {
          timestamp: bucketTs,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          errorCount: 0,
        };
        map.set(bucketTs, acc);
      }
      acc.requests++;
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.cacheReadTokens += row.cacheReadTokens;
      acc.cacheCreationTokens += row.cacheCreationTokens;
      if (row.source === "error") acc.errorCount++;
    }

    // Always emit `buckets` slots — the chart needs a contiguous timeline,
    // not just the populated buckets.
    const filled: Acc[] = [];
    for (let i = 0; i < buckets; i++) {
      const ts = since + i * bucketSize;
      const bucketTs = Math.floor(ts / bucketSize) * bucketSize;
      const match = map.get(bucketTs);
      filled.push(
        match ?? {
          timestamp: ts,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          errorCount: 0,
        },
      );
    }

    return filled;
  },
});

export const getRecentErrors = query({
  args: {
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    now: v.number(),
  },
  handler: async (ctx, { limit = 10, since = 0, until, now }) => {
    const periodEnd = until ?? now;

    const inWindow = await ctx.db
      .query("requests")
      .withIndex("by_source_timestamp", (q) =>
        q.eq("source", "error").gte("timestamp", since).lte("timestamp", periodEnd),
      )
      .order("desc")
      .collect();

    const allTime = (
      await ctx.db
        .query("requests")
        .withIndex("by_source_timestamp", (q) => q.eq("source", "error"))
        .collect()
    ).length;

    return {
      total: inWindow.length,
      totalAllTime: allTime,
      errors: inWindow.slice(0, limit).map((row) => ({
        id: row._id,
        timestamp: row.timestamp,
        model: row.model,
        error: row.error ?? null,
        latencyMs: row.latencyMs ?? null,
        route: row.route ?? null,
      })),
    };
  },
});

export const getBudgetDaySummary = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const periodStart = start.getTime();
    const periodEnd = now;

    const rows = await ctx.db
      .query("requests")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", periodStart).lte("timestamp", periodEnd))
      .collect();

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let thinkingTokens = 0;
    for (const row of rows) {
      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;
      cacheReadTokens += row.cacheReadTokens;
      cacheCreationTokens += row.cacheCreationTokens;
      thinkingTokens += row.thinkingTokens;
    }

    return {
      periodStart,
      periodEnd,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      thinkingTokens,
      estimatedUsd: estimateRequestUsd(
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      ),
    };
  },
});

// Plan-window usage. Counts input + output + cache_creation at full weight,
// cache_read at 10% (matches Anthropic's cached-read burn rate). Successful
// (non-error) claude_code requests only.
export const getPlanWindowUsage = query({
  args: {
    sinceMs: v.number(),
    now: v.number(),
  },
  handler: async (ctx, { sinceMs, now }) => {

    const rows = await ctx.db
      .query("requests")
      .withIndex("by_source_timestamp", (q) =>
        q.eq("source", "claude_code").gte("timestamp", sinceMs).lte("timestamp", now),
      )
      .collect();

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let oldestTimestamp: number | null = null;
    for (const row of rows) {
      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;
      cacheReadTokens += row.cacheReadTokens;
      cacheCreationTokens += row.cacheCreationTokens;
      if (oldestTimestamp === null || row.timestamp < oldestTimestamp) {
        oldestTimestamp = row.timestamp;
      }
    }

    return {
      tokens: Math.round(
        inputTokens +
          outputTokens +
          cacheCreationTokens +
          cacheReadTokens * CACHE_READ_COST_RATIO,
      ),
      oldestTimestamp,
    };
  },
});

export const resetAnalytics = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("requests").collect();
    for (const row of all) {
      await ctx.db.delete(row._id);
    }
    return { deletedCount: all.length };
  },
});
