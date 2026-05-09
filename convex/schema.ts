import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // High-volume analytics writes. Every proxied request lands here.
  // Keep the column shape close to src/db.ts so the port is mechanical.
  requests: defineTable({
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

    // Request shape (computed in src/request-metrics.ts)
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

    // Routing decision
    appliedModel: v.optional(v.union(v.string(), v.null())),
    appliedThinkingEffort: v.optional(v.union(v.string(), v.null())),
    routingPolicy: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_source_timestamp", ["source", "timestamp"]),

  // Singleton: model picker + thinking effort + plan tier. Keyed on a fixed
  // string so we always upsert the same row.
  modelSettings: defineTable({
    key: v.literal("singleton"),
    selectedModel: v.string(),
    thinkingEnabled: v.boolean(),
    thinkingEffort: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
      v.literal("max"),
    ),
    subscriptionPlan: v.union(
      v.literal("pro"),
      v.literal("max5x"),
      v.literal("max20x"),
    ),
  }).index("by_key", ["key"]),

  // Singleton: latest plan-usage snapshot derived from anthropic-ratelimit-*
  // headers. Stores the parsed JSON shape from src/plan-usage-snapshot.ts.
  planUsageSnapshot: defineTable({
    key: v.literal("singleton"),
    capturedAt: v.number(),
    overallStatus: v.union(v.string(), v.null()),
    representativeClaim: v.optional(
      v.union(v.literal("five_hour"), v.literal("seven_day"), v.null()),
    ),
    fiveHour: v.union(
      v.object({
        utilization: v.number(),
        resetAt: v.number(),
        status: v.string(),
      }),
      v.null(),
    ),
    weekly: v.union(
      v.object({
        utilization: v.number(),
        resetAt: v.number(),
        status: v.string(),
      }),
      v.null(),
    ),
    fallbackPercentage: v.union(v.number(), v.null()),
    overageStatus: v.union(v.string(), v.null()),
  }).index("by_key", ["key"]),

  // Singleton: stored OAuth credentials. Replaces /data/auth/auth.json on
  // disk. Read/written via internalMutation only — never exposed client-side.
  oauthTokens: defineTable({
    key: v.literal("singleton"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
    obtainedAt: v.number(),
  }).index("by_key", ["key"]),

  // Active PKCE flows. Each row is keyed by the OAuth `state` parameter and
  // holds the matching `code_verifier` until the callback exchanges it.
  // Persisting in Convex (instead of an in-memory Map) survives Next dev
  // reloads and lets multi-process deployments share state.
  pkceState: defineTable({
    state: v.string(),
    codeVerifier: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  // Materialized counters keyed by name. Avoids `O(n)` scans like
  // `.collect().length` for "total requests recorded". Bumped atomically
  // inside Convex mutations.
  counters: defineTable({
    key: v.string(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
