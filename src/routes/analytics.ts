import {
  getAnalytics,
  getAnalyticsTimeline,
  getRecentErrors,
  getRecentRequests,
  resetAnalytics,
} from "../db";

function validatePaginationParams(
  limit: number,
  offset: number,
): { limit: number; offset: number } {
  return {
    limit: Number.isInteger(limit) && limit >= 1 && limit <= 1000 ? limit : 20,
    offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
  };
}

function calculateSince(period: string | null): number {
  const now = Date.now();
  switch (period) {
    case "5hour":
      return now - 5 * 3_600_000;
    case "week":
      return now - 7 * 86_400_000;
    case "month":
      return now - 30 * 86_400_000;
    case "all":
      return 0;
    default:
      return now - 86_400_000;
  }
}

function calculateTimelineSince(period: string | null): number {
  if (period === "all") return Date.now() - 90 * 86_400_000;
  return calculateSince(period);
}

export function handleAnalytics(url: URL): Response {
  const period = url.searchParams.get("period") || "day";
  const since = calculateSince(period);
  const analytics = getAnalytics(since, Date.now());

  return Response.json({
    period,
    ...analytics,
  });
}

export function handleAnalyticsRequests(url: URL): Response {
  const rawLimit = parseInt(url.searchParams.get("limit") || "20", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") || "0", 10);
  const period = url.searchParams.get("period") || "all";
  const since = calculateSince(period);

  const validated = validatePaginationParams(rawLimit, rawOffset);
  const { requests, total } = getRecentRequests(validated.limit, since, validated.offset);
  return Response.json({ requests, total });
}

const PERIOD_BUCKETS: Record<string, number> = {
  "5hour": 20,
  day: 24,
  week: 7,
  month: 30,
  all: 30,
};

export function handleAnalyticsTimeline(url: URL): Response {
  const period = url.searchParams.get("period") || "day";
  const since = calculateTimelineSince(period);
  const buckets = PERIOD_BUCKETS[period] ?? 24;
  const timeline = getAnalyticsTimeline(since, Date.now(), buckets);

  return Response.json({ period, buckets: timeline });
}

export function handleAnalyticsErrors(url: URL): Response {
  const rawLimit = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 10;
  const period = url.searchParams.get("period") || "day";
  const since = calculateSince(period);

  const { errors, total, totalAllTime } = getRecentErrors(limit, since, Date.now());
  return Response.json({ errors, total, totalAllTime });
}

export function handleAnalyticsReset(): Response {
  try {
    const result = resetAnalytics();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Reset analytics error:", error);
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "Reset failed" } },
      { status: 500 },
    );
  }
}
