import { getAnalytics, getRecentRequests, resetAnalytics } from "../db";

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
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const requests = getRecentRequests(Math.min(limit, 1000));
  return Response.json({ requests });
}

export function handleAnalyticsReset(): Response {
  const result = resetAnalytics();
  return Response.json({ success: true, ...result });
}
