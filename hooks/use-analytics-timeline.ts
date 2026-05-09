"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_SLOW } from "~/lib/intervals";
import { type AnalyticsTimeline, analyticsTimelineSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsTimelineSchema);

export function useAnalyticsTimeline(period: Period, fallback?: AnalyticsTimeline) {
  return useSWR<AnalyticsTimeline>(`${API_ROUTES.analyticsTimeline}?period=${period}`, fetcher, {
    refreshInterval: POLL_SLOW,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
