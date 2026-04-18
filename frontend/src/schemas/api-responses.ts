import { z } from "zod";
import { supportedModels, supportedPlans, thinkingEfforts } from "./settings";

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
  source: z.enum(["claude_code", "error"]),
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

export const errorRecordSchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  model: z.string(),
  error: z.string().nullable(),
  latencyMs: z.number().nullable(),
  route: z.enum(["anthropic", "openai"]).nullable().optional(),
});

export type ErrorRecord = z.infer<typeof errorRecordSchema>;

export const analyticsErrorsResponseSchema = z.object({
  errors: z.array(errorRecordSchema),
  total: z.number(),
  totalAllTime: z.number(),
});

export type AnalyticsErrorsResponse = z.infer<typeof analyticsErrorsResponseSchema>;

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
    subscriptionPlan: z.enum(supportedPlans),
  }),
});

export const planUsageSourceSchema = z.enum(["anthropic", "estimated", "none"]);
export type PlanUsageSource = z.infer<typeof planUsageSourceSchema>;

export const planUsageWindowSchema = z.object({
  percent: z.number(),
  resetAt: z.number(),
  /** Only populated in `estimated` mode — the `anthropic` snapshot path only
   *  gives us the utilization fraction, not absolute token counts. */
  tokens: z.number().optional(),
  limit: z.number().optional(),
  status: z.string().optional(),
});

export const planUsageResponseSchema = z.object({
  plan: z.enum(supportedPlans),
  source: planUsageSourceSchema,
  capturedAt: z.number().nullable(),
  representativeClaim: z.enum(["five_hour", "seven_day"]).nullable(),
  quotas: z.object({
    fiveHourTokens: z.number(),
    weeklyTokens: z.number(),
  }),
  usage: z.object({
    fiveHour: planUsageWindowSchema,
    weekly: planUsageWindowSchema,
  }),
});

export type PlanUsageResponse = z.infer<typeof planUsageResponseSchema>;
export type PlanUsageWindow = z.infer<typeof planUsageWindowSchema>;

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
