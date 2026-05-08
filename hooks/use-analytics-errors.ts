"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type AnalyticsErrors, analyticsErrorsSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsErrorsSchema);

export function useAnalyticsErrors(period: Period, limit = 5, fallback?: AnalyticsErrors) {
  return useSWR<AnalyticsErrors>(`/api/analytics/errors?period=${period}&limit=${limit}`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
