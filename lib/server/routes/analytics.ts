import {
  getAnalytics,
  getAnalyticsTimeline,
  getRecentErrors,
  getRecentRequests,
  resetAnalytics,
} from "../db";
import { toErrorMessage } from "../error-utils";
import { logger } from "../logger";

function validatePageSize(raw: number): number {
  return Number.isInteger(raw) && raw >= 1 && raw <= 1000 ? raw : 20;
}

/**
 * Resolve the start of an analytics window. The timeline endpoint shows a
 * 90-day history when the user picks "all"; the rolling-summary endpoints
 * fall back to the beginning of time. Pass `allWindowMs` to opt into the
 * timeline behaviour.
 */
function calculateSince(period: string | null, allWindowMs?: number): number {
  const now = Date.now();
  switch (period) {
    case "5hour":
      return now - 5 * 3_600_000;
    case "week":
      return now - 7 * 86_400_000;
    case "month":
      return now - 30 * 86_400_000;
    case "all":
      return allWindowMs ? now - allWindowMs : 0;
    default:
      return now - 86_400_000;
  }
}

export async function handleAnalytics(url: URL): Promise<Response> {
  const period = url.searchParams.get("period") || "day";
  const since = calculateSince(period);
  const analytics = await getAnalytics(since, Date.now());

  return Response.json({
    period,
    ...analytics,
  });
}

export async function handleAnalyticsRequests(url: URL): Promise<Response> {
  const pageSize = validatePageSize(parseInt(url.searchParams.get("limit") || "20", 10));
  const cursor = url.searchParams.get("cursor"); // null = first page
  const period = url.searchParams.get("period") || "all";

  // Convex pagination cursors are tied to the exact query (including the
  // `since` filter). Once page 1 commits to a `since`, subsequent pages MUST
  // reuse it or Convex returns InvalidCursor. The client echoes back the
  // `since` we returned in the previous response; on page 1 we compute it
  // from `period`.
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? Number.parseInt(sinceParam, 10) : calculateSince(period);

  const result = await getRecentRequests(pageSize, since, cursor);
  return Response.json({
    requests: result.requests,
    total: result.total,
    isDone: result.isDone,
    continueCursor: result.continueCursor,
    since,
  });
}

const PERIOD_BUCKETS: Record<string, number> = {
  "5hour": 20,
  day: 24,
  week: 7,
  month: 30,
  all: 30,
};

export async function handleAnalyticsTimeline(url: URL): Promise<Response> {
  const period = url.searchParams.get("period") || "day";
  const since = calculateSince(period, 90 * 86_400_000);
  const buckets = PERIOD_BUCKETS[period] ?? 24;
  const timeline = await getAnalyticsTimeline(since, Date.now(), buckets);

  return Response.json({ period, buckets: timeline });
}

export async function handleAnalyticsErrors(url: URL): Promise<Response> {
  const rawLimit = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 10;
  const period = url.searchParams.get("period") || "day";
  const since = calculateSince(period);

  const { errors, total, totalAllTime } = await getRecentErrors(limit, since, Date.now());
  return Response.json({ errors, total, totalAllTime });
}

export async function handleAnalyticsReset(): Promise<Response> {
  try {
    const result = await resetAnalytics();
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error(`Reset analytics error: ${message}`);
    return Response.json({ error: { message: message || "Reset failed" } }, { status: 500 });
  }
}
