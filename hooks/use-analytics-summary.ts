"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_FAST } from "~/lib/intervals";
import { type AnalyticsSummary, analyticsSummarySchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsSummarySchema);

export function useAnalyticsSummary(period: Period, fallback?: AnalyticsSummary) {
  return useSWR<AnalyticsSummary>(`${API_ROUTES.analyticsSummary}?period=${period}`, fetcher, {
    refreshInterval: POLL_FAST,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
