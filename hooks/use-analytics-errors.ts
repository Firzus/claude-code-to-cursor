"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_SLOW } from "~/lib/intervals";
import { type AnalyticsErrors, analyticsErrorsSchema, type Period } from "~/lib/schemas";

const fetcher = makeFetcher(analyticsErrorsSchema);

export function useAnalyticsErrors(period: Period, limit = 5, fallback?: AnalyticsErrors) {
  return useSWR<AnalyticsErrors>(
    `${API_ROUTES.analyticsErrors}?period=${period}&limit=${limit}`,
    fetcher,
    {
      refreshInterval: POLL_SLOW,
      revalidateOnFocus: false,
      fallbackData: fallback,
    },
  );
}
