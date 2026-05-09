import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Domain enums (mirrored from src/model-settings.ts)                  */
/* ------------------------------------------------------------------ */

export const supportedModels = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export type SupportedModel = (typeof supportedModels)[number];

export const modelLabels: Record<SupportedModel, string> = {
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

export const thinkingEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingEffort = (typeof thinkingEfforts)[number];

/**
 * Models that support the extended `xhigh` and `max` thinking efforts.
 *
 * As of now only Opus 4.7 exposes these tiers. Other Claude models accept
 * `low | medium | high` only. The dashboard uses this to filter the effort
 * dropdown; the proxy/server is intentionally permissive so a future model
 * can join the list without a coordinated release.
 */
export const HIGH_EFFORT_MODELS = ["claude-opus-4-7"] as const;

export const STANDARD_THINKING_EFFORTS = ["low", "medium", "high"] as const satisfies readonly ThinkingEffort[];

export function modelSupportsHighEffort(model: SupportedModel | string): boolean {
  return (HIGH_EFFORT_MODELS as readonly string[]).includes(model);
}

export function allowedEffortsForModel(
  model: SupportedModel | string,
): readonly ThinkingEffort[] {
  return modelSupportsHighEffort(model) ? thinkingEfforts : STANDARD_THINKING_EFFORTS;
}

export const supportedPlans = ["pro", "max5x", "max20x"] as const;
export type SupportedPlan = (typeof supportedPlans)[number];

export const planLabels: Record<SupportedPlan, string> = {
  pro: "Pro",
  max5x: "Max 5×",
  max20x: "Max 20×",
};

export const planPrices: Record<SupportedPlan, string> = {
  pro: "$20/mo",
  max5x: "$100/mo",
  max20x: "$200/mo",
};

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

export const eventLoopLagSchema = z
  .object({
    samples: z.number(),
    p50: z.number(),
    p95: z.number(),
    max: z.number(),
    windowMs: z.number(),
  })
  .passthrough()
  .optional();

export const tunnelStatusSchema = z.object({
  state: z.enum(["online", "offline", "unreachable"]),
  connections: z.number().optional(),
  latencyMs: z.number().optional(),
  checkedAt: z.number(),
  error: z.string().optional(),
});

export type TunnelStatus = z.infer<typeof tunnelStatusSchema>;

export const healthSchema = z.object({
  status: z.enum(["ok", "rate_limited", "error"]),
  message: z.string().optional(),
  tunnelUrl: z.string().optional(),
  /** Live state of the cloudflared tunnel (probed via its metrics endpoint). */
  tunnel: tunnelStatusSchema.optional(),
  claudeCode: z.object({
    authenticated: z.boolean(),
    expiresAt: z.number().nullable().optional(),
  }),
  rateLimit: z
    .object({
      isLimited: z.boolean(),
      resetAt: z.number().nullable(),
      minutesRemaining: z.number().nullable(),
      inSoftExpiry: z.boolean(),
      cachedAt: z.number().nullable(),
    })
    .passthrough(),
  eventLoopLag: z.union([z.number(), eventLoopLagSchema]).optional(),
});

export type Health = z.infer<typeof healthSchema>;

/* ------------------------------------------------------------------ */
/* Plan usage                                                          */
/* ------------------------------------------------------------------ */

export const planUsageSourceSchema = z.enum(["anthropic", "estimated", "none"]);
export type PlanUsageSource = z.infer<typeof planUsageSourceSchema>;

export const planUsageWindowSchema = z.object({
  percent: z.number(),
  resetAt: z.number(),
  tokens: z.number().optional(),
  limit: z.number().optional(),
  status: z.string().optional(),
});

export type PlanUsageWindow = z.infer<typeof planUsageWindowSchema>;

export const planUsageSchema = z.object({
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

export type PlanUsage = z.infer<typeof planUsageSchema>;

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export const budgetSchema = z.object({
  periodStart: z.number(),
  periodEnd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
  thinkingTokens: z.number(),
  estimatedUsd: z.number(),
});

export type Budget = z.infer<typeof budgetSchema>;

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export const periodSchema = z.enum(["5hour", "day", "week", "month", "all"]);
export type Period = z.infer<typeof periodSchema>;

export const analyticsSummarySchema = z.object({
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
  cacheSavingsUsdEstimate: z.number(),
  periodStart: z.number(),
  periodEnd: z.number(),
});

export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

export const requestRecordSchema = z.object({
  // Convex returns `_id` as an opaque string (Id<"requests">), not a number.
  id: z.string(),
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

export const analyticsRequestsSchema = z.object({
  requests: z.array(requestRecordSchema),
  total: z.number(),
});

export type AnalyticsRequests = z.infer<typeof analyticsRequestsSchema>;

export const timelineBucketSchema = z.object({
  timestamp: z.number(),
  requests: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number().default(0),
  errorCount: z.number(),
});

export const analyticsTimelineSchema = z.object({
  period: z.string(),
  buckets: z.array(timelineBucketSchema),
});

export type AnalyticsTimeline = z.infer<typeof analyticsTimelineSchema>;

export const errorRecordSchema = z.object({
  // Convex returns `_id` as an opaque string (Id<"requests">), not a number.
  id: z.string(),
  timestamp: z.number(),
  model: z.string(),
  error: z.string().nullable(),
  latencyMs: z.number().nullable(),
  route: z.enum(["anthropic", "openai"]).nullable().optional(),
});

export type ErrorRecord = z.infer<typeof errorRecordSchema>;

export const analyticsErrorsSchema = z.object({
  errors: z.array(errorRecordSchema),
  total: z.number(),
  totalAllTime: z.number(),
});

export type AnalyticsErrors = z.infer<typeof analyticsErrorsSchema>;

export const analyticsResetSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const modelSettingsSchema = z.object({
  selectedModel: z.enum(supportedModels),
  thinkingEnabled: z.boolean(),
  thinkingEffort: z.enum(thinkingEfforts),
  subscriptionPlan: z.enum(supportedPlans),
});

export type ModelSettings = z.infer<typeof modelSettingsSchema>;

export const settingsResponseSchema = z.object({
  settings: modelSettingsSchema,
});

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const authLoginSchema = z.object({
  authURL: z.string(),
  state: z.string(),
});

export type AuthLogin = z.infer<typeof authLoginSchema>;

export const authStatusSchema = z.object({
  authenticated: z.boolean(),
  expiresAt: z.number().nullable(),
});

export type AuthStatus = z.infer<typeof authStatusSchema>;

export const authCallbackResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  expiresIn: z.number().optional(),
});

export type AuthCallbackResult = z.infer<typeof authCallbackResultSchema>;

/* ------------------------------------------------------------------ */
/* Rate limit                                                          */
/* ------------------------------------------------------------------ */

export const rateLimitSchema = z.object({
  isLimited: z.boolean(),
  resetAt: z.number().nullable(),
  minutesRemaining: z.number().nullable(),
  inSoftExpiry: z.boolean(),
  cachedAt: z.number().nullable(),
});

export type RateLimitState = z.infer<typeof rateLimitSchema>;
