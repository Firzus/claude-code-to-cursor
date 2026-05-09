"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_FAST } from "~/lib/intervals";
import { type AnalyticsRequests, analyticsRequestsSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsRequestsSchema);

export function useAnalyticsRequests(
  period: Period,
  page: number,
  pageSize: number,
  fallback?: AnalyticsRequests,
) {
  const offset = Math.max(0, (page - 1) * pageSize);
  return useSWR<AnalyticsRequests>(
    `${API_ROUTES.analyticsRequests}?period=${period}&limit=${pageSize}&offset=${offset}`,
    fetcher,
    {
      refreshInterval: POLL_FAST,
      revalidateOnFocus: false,
      fallbackData: fallback,
      keepPreviousData: true,
    },
  );
}
