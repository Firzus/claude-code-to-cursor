"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type AnalyticsSummary, analyticsSummarySchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsSummarySchema);

export function useAnalyticsSummary(period: Period, fallback?: AnalyticsSummary) {
  return useSWR<AnalyticsSummary>(`/api/analytics?period=${period}`, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
