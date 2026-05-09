/**
 * Centralized API route paths shared between server-side `lib/api.ts`
 * and client-side `hooks/*`. One source of truth so renames stay safe.
 */

export const API_ROUTES = {
  health: "/api/health",
  budget: "/api/budget",
  planUsage: "/api/plan-usage",
  analyticsSummary: "/api/analytics",
  analyticsTimeline: "/api/analytics/timeline",
  analyticsRequests: "/api/analytics/requests",
  analyticsErrors: "/api/analytics/errors",
  analyticsReset: "/api/analytics/reset",
  settings: "/api/settings",
  settingsModel: "/api/settings/model",
  authStatus: "/api/auth/status",
  authLogin: "/api/auth/login",
  authCallback: "/api/auth/callback",
  rateLimit: "/api/rate-limit",
  rateLimitReset: "/api/rate-limit/reset",
} as const;
