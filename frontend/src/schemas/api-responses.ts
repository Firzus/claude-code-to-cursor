import { z } from "zod";
import { supportedModels, thinkingEfforts } from "./settings";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "rate_limited"]),
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
  cacheHitRate: z.number(),
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
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  stream: z.union([z.boolean(), z.number()]),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
});

export type RequestRecord = z.infer<typeof requestRecordSchema>;

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
  }),
});

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
