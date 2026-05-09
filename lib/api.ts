import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { type ZodType, z } from "zod";
import { API_ROUTES } from "./api-routes";
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
  return backendFetch(API_ROUTES.health, healthSchema, { forwardedFor });
}

export async function getPlanUsage(forwardedFor?: string): Promise<PlanUsage> {
  return backendFetch(API_ROUTES.planUsage, planUsageSchema, { forwardedFor });
}

export async function getBudget(forwardedFor?: string): Promise<Budget> {
  return backendFetch(API_ROUTES.budget, budgetSchema, { forwardedFor });
}

export async function getAnalyticsSummary(
  period: Period,
  forwardedFor?: string,
): Promise<AnalyticsSummary> {
  return backendFetch(
    `${API_ROUTES.analyticsSummary}?period=${encodeURIComponent(period)}`,
    analyticsSummarySchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getAnalyticsTimeline(
  period: Period,
  forwardedFor?: string,
): Promise<AnalyticsTimeline> {
  return backendFetch(
    `${API_ROUTES.analyticsTimeline}?period=${encodeURIComponent(period)}`,
    analyticsTimelineSchema,
    { forwardedFor, authenticated: true },
  );
}

export async function getAnalyticsRequests(
  period: Period,
  pageSize: number,
  cursor: string | null,
  forwardedFor?: string,
): Promise<AnalyticsRequests> {
  const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return backendFetch(
    `${API_ROUTES.analyticsRequests}?period=${encodeURIComponent(period)}&limit=${pageSize}${cursorParam}`,
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
    `${API_ROUTES.analyticsErrors}?period=${encodeURIComponent(period)}&limit=${limit}`,
    analyticsErrorsSchema,
    { forwardedFor, authenticated: true },
  );
}

// Cache settings reads with the `settings` tag so that `savePreferencesAction`
// can invalidate them via `revalidateTag('settings')`. The `forwardedFor` arg
// fragments the cache by upstream IP — fine for single-user deployments and
// keeps the IP-whitelist semantics intact server-side.
export async function getSettings(forwardedFor?: string): Promise<SettingsResponse> {
  "use cache";
  cacheTag("settings");
  cacheLife("minutes");
  return backendFetch(API_ROUTES.settings, settingsResponseSchema, {
    forwardedFor,
    authenticated: true,
  });
}

export async function getAuthStatus(forwardedFor?: string): Promise<AuthStatus> {
  return backendFetch(API_ROUTES.authStatus, authStatusSchema, {
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
  const data = await backendFetch(API_ROUTES.settingsModel, z4SuccessSettings, {
    method: "POST",
    body: settings,
    authenticated: true,
    forwardedFor,
  });
  return data.settings;
}

export async function postAnalyticsReset(forwardedFor?: string): Promise<number> {
  const data = await backendFetch(API_ROUTES.analyticsReset, analyticsResetSchema, {
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
  await fetch(`${serverEnv.internalUrl}${API_ROUTES.rateLimitReset}`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
}

export async function postAuthLogin(forwardedFor?: string): Promise<AuthLogin> {
  return backendFetch(API_ROUTES.authLogin, authLoginSchema, {
    forwardedFor,
    authenticated: true,
  });
}

export async function postAuthCallback(
  payload: { code: string; state: string },
  forwardedFor?: string,
): Promise<AuthCallbackResult> {
  return backendFetch(API_ROUTES.authCallback, authCallbackResultSchema, {
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
