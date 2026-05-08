"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type AnalyticsTimeline, analyticsTimelineSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsTimelineSchema);

export function useAnalyticsTimeline(period: Period, fallback?: AnalyticsTimeline) {
  return useSWR<AnalyticsTimeline>(`/api/analytics/timeline?period=${period}`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
