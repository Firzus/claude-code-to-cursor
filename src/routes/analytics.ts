import { getAnalytics, getRecentRequests, resetAnalytics, getAnalyticsTimeline } from "../db";

export function handleAnalytics(url: URL): Response {
  const period = url.searchParams.get("period") || "day";
  const now = Date.now();
  let since: number;

  switch (period) {
    case "hour":
      since = now - 60 * 60 * 1000;
      break;
    case "day":
      since = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      since = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      since = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case "all":
      since = 0;
      break;
    default:
      since = now - 24 * 60 * 60 * 1000;
  }

  const analytics = getAnalytics(since, now);

  return Response.json({
    period,
    ...analytics,
  });
}

export function handleAnalyticsRequests(url: URL): Response {
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const period = url.searchParams.get("period") || "all";
  const now = Date.now();
  let since: number;

  switch (period) {
    case "hour":
      since = now - 60 * 60 * 1000;
      break;
    case "day":
      since = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      since = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      since = now - 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      since = 0;
  }

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
  const now = Date.now();
  let since: number;

  switch (period) {
    case "hour":
      since = now - 60 * 60 * 1000;
      break;
    case "day":
      since = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      since = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      since = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case "all":
      since = now - 90 * 24 * 60 * 60 * 1000;
      break;
    default:
      since = now - 24 * 60 * 60 * 1000;
  }

  const buckets = PERIOD_BUCKETS[period] ?? 24;
  const timeline = getAnalyticsTimeline(since, now, buckets);

  return Response.json({ period, buckets: timeline });
}

export function handleAnalyticsReset(): Response {
  const result = resetAnalytics();
  return Response.json({ success: true, ...result });
}
