import { getAnalytics, getRecentRequests, resetAnalytics, getAnalyticsTimeline } from "../db";

function calculateSince(period: string | null): number {
  const now = Date.now();
  switch (period) {
    case "hour":
      return now - 3_600_000;
    case "week":
      return now - 7 * 86_400_000;
    case "month":
      return now - 30 * 86_400_000;
    case "all":
      return 0;
    case "day":
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
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const period = url.searchParams.get("period") || "all";
  const since = calculateSince(period);

  const { requests, total } = getRecentRequests(Math.min(limit, 1000), since, offset);
  return Response.json({ requests, total });
}

const PERIOD_BUCKETS: Record<string, number> = {
  hour: 12,
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

export function handleAnalyticsReset(): Response {
  try {
    const result = resetAnalytics();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Reset analytics error:", error);
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "Reset failed" } },
      { status: 500 }
    );
  }
}
