import "server-only";

import { api } from "../../convex/_generated/api";
import { convex } from "./convex";
import { logger } from "./logger";
import { type ModelSettings, validateModelSettings } from "./model-settings";
import type { RoutingDecision } from "./routing-policy";
import type { RequestShapeMetrics } from "./types";
import type { AnthropicUsageSnapshot } from "./usage";

export type { RequestShapeMetrics };

type RequestSource = "claude_code" | "error";

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

// Mirror of src/db.ts recordRequest. Fire-and-forget — analytics loss must
// not crash the proxy. The 50 ms / 50-entry batching from the SQLite version
// isn't needed: Convex coalesces writes server-side and we don't pay an
// fsync per call here.
export function recordRequest(record: RequestRecord): void {
  convex
    .mutation(api.requests.recordRequest, {
      timestamp: Date.now(),
      model: record.model,
      source: record.source,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cacheReadTokens: record.cacheReadTokens ?? 0,
      cacheCreationTokens: record.cacheCreationTokens ?? 0,
      thinkingTokens: record.thinkingTokens ?? 0,
      stream: record.stream,
      latencyMs: record.latencyMs ?? null,
      error: record.error ?? null,
      route: record.shape?.route ?? null,
      messageCount: record.shape?.messageCount ?? null,
      lastMsgRole: record.shape?.lastMsgRole ?? null,
      lastMsgHasToolResult: record.shape?.lastMsgHasToolResult ?? null,
      toolUseCount: record.shape?.toolUseCount ?? null,
      toolResultCount: record.shape?.toolResultCount ?? null,
      toolDefsCount: record.shape?.toolDefsCount ?? null,
      toolDefsHash: record.shape?.toolDefsHash ?? null,
      clientSystemHash: record.shape?.clientSystemHash ?? null,
      clientReasoningEffort: record.shape?.clientReasoningEffort ?? null,
      appliedModel: record.appliedModel ?? null,
      appliedThinkingEffort: record.decision?.effort ?? null,
      routingPolicy: record.decision?.policy ?? null,
    })
    .catch((err) => {
      logger.error(`[db] recordRequest failed: ${(err as Error).message ?? err}`);
    });
}

/**
 * Convenience wrapper around `recordRequest` for the common case where the
 * caller has just produced an `AnthropicUsageSnapshot`. Spreads the snapshot
 * fields and fills in routing metadata; saves a 7-line copy at every site.
 */
export function recordUsage(args: {
  usage: AnthropicUsageSnapshot;
  model: string;
  appliedModel: string;
  stream: boolean;
  latencyMs: number;
  shape?: RequestShapeMetrics;
  decision?: RoutingDecision;
}): void {
  recordRequest({
    model: args.model,
    source: "claude_code",
    inputTokens: args.usage.inputTokens,
    outputTokens: args.usage.outputTokens,
    cacheReadTokens: args.usage.cacheReadTokens,
    cacheCreationTokens: args.usage.cacheCreationTokens,
    thinkingTokens: args.usage.thinkingTokens,
    stream: args.stream,
    latencyMs: args.latencyMs,
    shape: args.shape,
    decision: args.decision,
    appliedModel: args.appliedModel,
  });
}

// Async accessors used by route handlers. These are not called from the
// hot path (anthropic-client) so the await cost is irrelevant.

export async function getModelSettings(): Promise<ModelSettings> {
  const raw = await convex.query(api.modelSettings.get, {});
  // Convex stores selectedModel as v.string(); validateModelSettings narrows
  // it back to the SupportedSelectedModel union (and falls back to defaults
  // if a manual edit ever produced a value outside the union).
  return validateModelSettings(raw);
}

export async function saveModelSettings(settings: ModelSettings) {
  await convex.mutation(api.modelSettings.save, settings);
}

// `now` is captured here (Convex queries must be deterministic) and forwarded
// to every time-windowed query so the server-side cache stays valid.

export async function getAnalytics(since: number, until?: number) {
  return convex.query(api.requests.getAnalytics, { since, until, now: Date.now() });
}

export async function getRecentRequests(
  pageSize: number,
  since?: number,
  cursor: string | null = null,
) {
  return convex.query(api.requests.getRecentRequests, {
    paginationOpts: { numItems: pageSize, cursor },
    since,
  });
}

export async function getAnalyticsTimeline(since: number, until?: number, buckets?: number) {
  return convex.query(api.requests.getAnalyticsTimeline, {
    since,
    until,
    buckets,
    now: Date.now(),
  });
}

export async function getRecentErrors(limit?: number, since?: number, until?: number) {
  return convex.query(api.requests.getRecentErrors, { limit, since, until, now: Date.now() });
}

export async function getBudgetDaySummary() {
  return convex.query(api.requests.getBudgetDaySummary, { now: Date.now() });
}

export async function getPlanWindowUsage(sinceMs: number) {
  return convex.query(api.requests.getPlanWindowUsage, { sinceMs, now: Date.now() });
}

export async function resetAnalytics() {
  return convex.mutation(api.requests.resetAnalytics, {});
}
