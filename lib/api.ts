import "server-only";

import { type ZodType, z } from "zod";
import { serverEnv } from "./env";
import {
  type AnalyticsErrors,
  type AnalyticsRequests,
  type AnalyticsSummary,
  type AnalyticsTimeline,
  type AuthCallbackResult,
  type AuthLogin,
  type AuthStatus,
  analyticsErrorsSchema,
  analyticsRequestsSchema,
  analyticsResetSchema,
  analyticsSummarySchema,
  analyticsTimelineSchema,
  authCallbackResultSchema,
  authLoginSchema,
  authStatusSchema,
  type Budget,
  budgetSchema,
  type Health,
  healthSchema,
  type ModelSettings,
  modelSettingsSchema,
  type Period,
  type PlanUsage,
  planUsageSchema,
  type SettingsResponse,
  settingsResponseSchema,
} from "./schemas";

interface FetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Send the x-settings-key header. Default: false. */
  authenticated?: boolean;
  /** Cache strategy. Default: no-store (live data). */
  cache?: RequestCache;
  /** Tags for `revalidateTag()`. */
  tags?: string[];
  /** Forwarded `cf-connecting-ip` to bypass IP whitelist when running behind a tunnel. */
  forwardedFor?: string;
}

export class BackendError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

async function backendFetch<T>(
  path: string,
  schema: ZodType<T>,
  options: FetchOptions = {},
): Promise<T> {
  const url = `${serverEnv.internalUrl}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.authenticated && serverEnv.settingsKey) {
    headers["x-settings-key"] = serverEnv.settingsKey;
  }
  if (options.forwardedFor) {
    headers["cf-connecting-ip"] = options.forwardedFor;
    headers["x-forwarded-for"] = options.forwardedFor;
  }

  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    method: options.method ?? "GET",
    headers,
    cache: options.cache ?? "no-store",
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.tags) init.next = { tags: options.tags };

  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Backend ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data?.error?.message) message = data.error.message;
    } catch {
      /* ignore */
    }
    throw new BackendError(res.status, message);
  }
  const data = (await res.json()) as unknown;
  return schema.parse(data);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function getHealth(forwardedFor?: string): Promise<Health> {
  return backendFetch("/api/health", healthSchema, { forwardedFor });
}

export async function getPlanUsage(forwardedFor?: string): Promise<PlanUsage> {
  return backendFetch("/api/plan-usage", planUsageSchema, { forwardedFor });
}

export async function getBudget(forwardedFor?: string): Promise<Budget> {
  return backendFetch("/api/budget", budgetSchema, { forwardedFor });
}

export async function getAnalyticsSummary(
  period: Period,
  forwardedFor?: string,
): Promise<AnalyticsSummary> {
  return backendFetch(
    `/api/analytics?period=${encodeURIComponent(period)}`,
    analyticsSummarySchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getAnalyticsTimeline(
  period: Period,
  forwardedFor?: string,
): Promise<AnalyticsTimeline> {
  return backendFetch(
    `/api/analytics/timeline?period=${encodeURIComponent(period)}`,
    analyticsTimelineSchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getAnalyticsRequests(
  period: Period,
  page: number,
  pageSize: number,
  forwardedFor?: string,
): Promise<AnalyticsRequests> {
  const offset = Math.max(0, (page - 1) * pageSize);
  return backendFetch(
    `/api/analytics/requests?period=${encodeURIComponent(period)}&limit=${pageSize}&offset=${offset}`,
    analyticsRequestsSchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getAnalyticsErrors(
  period: Period,
  limit: number,
  forwardedFor?: string,
): Promise<AnalyticsErrors> {
  return backendFetch(
    `/api/analytics/errors?period=${encodeURIComponent(period)}&limit=${limit}`,
    analyticsErrorsSchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getSettings(forwardedFor?: string): Promise<SettingsResponse> {
  return backendFetch("/api/settings", settingsResponseSchema, {
    forwardedFor,
    authenticated: true,
  });
}

export async function getAuthStatus(forwardedFor?: string): Promise<AuthStatus> {
  return backendFetch("/api/auth/status", authStatusSchema, {
    forwardedFor,
    authenticated: true,
  });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function postSettings(
  settings: ModelSettings,
  forwardedFor?: string,
): Promise<ModelSettings> {
  const data = await backendFetch("/api/settings/model", z4SuccessSettings, {
    method: "POST",
    body: settings,
    authenticated: true,
    forwardedFor,
  });
  return data.settings;
}

export async function postAnalyticsReset(forwardedFor?: string): Promise<number> {
  const data = await backendFetch("/api/analytics/reset", analyticsResetSchema, {
    method: "POST",
    authenticated: true,
    forwardedFor,
  });
  return data.deletedCount;
}

export async function postRateLimitReset(forwardedFor?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (serverEnv.settingsKey) headers["x-settings-key"] = serverEnv.settingsKey;
  if (forwardedFor) {
    headers["cf-connecting-ip"] = forwardedFor;
    headers["x-forwarded-for"] = forwardedFor;
  }
  await fetch(`${serverEnv.internalUrl}/api/rate-limit/reset`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
}

export async function postAuthLogin(forwardedFor?: string): Promise<AuthLogin> {
  return backendFetch("/api/auth/login", authLoginSchema, {
    forwardedFor,
    authenticated: true,
  });
}

export async function postAuthCallback(
  payload: { code: string; state: string },
  forwardedFor?: string,
): Promise<AuthCallbackResult> {
  return backendFetch("/api/auth/callback", authCallbackResultSchema, {
    method: "POST",
    body: payload,
    authenticated: true,
    forwardedFor,
  });
}

const z4SuccessSettings = z.object({
  success: z.literal(true),
  settings: modelSettingsSchema,
});
