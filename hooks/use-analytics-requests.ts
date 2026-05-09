"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_FAST } from "~/lib/intervals";
import { type AnalyticsRequests, analyticsRequestsSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsRequestsSchema);

export function useAnalyticsRequests(
  period: Period,
  pageSize: number,
  cursor: string | null,
  pinnedSince: number | null,
  fallback?: AnalyticsRequests,
) {
  const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  // Echo back the server's pinned `since` so Convex's cursor stays valid
  // across pages. On the very first call (cursor=null), we let the server
  // compute since from `period`.
  const sinceParam = pinnedSince !== null ? `&since=${pinnedSince}` : "";
  return useSWR<AnalyticsRequests>(
    `${API_ROUTES.analyticsRequests}?period=${period}&limit=${pageSize}${cursorParam}${sinceParam}`,
    fetcher,
    {
      refreshInterval: POLL_FAST,
      revalidateOnFocus: false,
      fallbackData: fallback,
      keepPreviousData: true,
    },
  );
}
