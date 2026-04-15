import { z } from "zod";
import {
  cacheTTLValues,
  keepaliveIntervalValues,
  supportedModels,
  thinkingEfforts,
} from "./settings";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "rate_limited"]),
  tunnelUrl: z.string().optional(),
  claudeCode: z.object({
    authenticated: z.boolean(),
    expiresAt: z.number().nullable().optional(),
    loginUrl: z.string().optional(),
  }),
  rateLimit: z.object({
    isLimited: z.boolean(),
    resetAt: z.number().nullable(),
    minutesRemaining: z.number().nullable(),
    inSoftExpiry: z.boolean(),
    cachedAt: z.number().nullable(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const analyticsResponseSchema = z.object({
  period: z.string(),
  totalRequests: z.number(),
  claudeCodeRequests: z.number(),
  errorRequests: z.number(),
  keepaliveRequests: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheReadTokens: z.number(),
  totalCacheCreationTokens: z.number(),
  totalThinkingTokens: z.number(),
  cacheHitRate: z.number(),
  /** Approximate USD saved vs no-cache-read pricing (dashboard heuristic). */
  cacheSavingsUsdEstimate: z.number(),
  periodStart: z.number(),
  periodEnd: z.number(),
});

export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

export const requestRecordSchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  model: z.string(),
  source: z.enum(["claude_code", "error", "keepalive"]),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().default(0),
  cacheCreationTokens: z.number().default(0),
  thinkingTokens: z.number().optional(),
  stream: z.union([z.boolean(), z.number()]),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
  route: z.enum(["anthropic", "openai"]).nullable().optional(),
  messageCount: z.number().nullable().optional(),
  toolDefsCount: z.number().nullable().optional(),
  routingPolicy: z.string().nullable().optional(),
  appliedThinkingEffort: z.string().nullable().optional(),
  estimatedUsd: z.number().optional(),
});

export type RequestRecord = z.infer<typeof requestRecordSchema>;

export const requestsResponseSchema = z.object({
  requests: z.array(requestRecordSchema),
  total: z.number(),
});

export type RequestsResponse = z.infer<typeof requestsResponseSchema>;

export const timelineBucketSchema = z.object({
  timestamp: z.number(),
  requests: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number().default(0),
  errorCount: z.number(),
});

export type TimelineBucket = z.infer<typeof timelineBucketSchema>;

export const timelineResponseSchema = z.object({
  period: z.string(),
  buckets: z.array(timelineBucketSchema),
});

export type TimelineResponse = z.infer<typeof timelineResponseSchema>;

export const loginResponseSchema = z.object({
  authURL: z.string(),
  state: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const authStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  expiresAt: z.number().nullable(),
});

export type AuthStatusResponse = z.infer<typeof authStatusResponseSchema>;

export const settingsResponseSchema = z.object({
  settings: z.object({
    selectedModel: z.enum(supportedModels),
    thinkingEnabled: z.boolean(),
    thinkingEffort: z.enum(thinkingEfforts),
    cacheTTL: z.enum(cacheTTLValues),
    keepaliveInterval: z.enum(keepaliveIntervalValues),
  }),
});

export const budgetResponseSchema = z.object({
  periodStart: z.number(),
  periodEnd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
  thinkingTokens: z.number(),
  estimatedUsd: z.number(),
});

export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
