"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
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
    `/api/analytics/requests?period=${period}&limit=${pageSize}&offset=${offset}`,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      fallbackData: fallback,
      keepPreviousData: true,
    },
  );
}
