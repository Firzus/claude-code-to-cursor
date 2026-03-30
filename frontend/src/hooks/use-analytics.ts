import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { AnalyticsResponse, RequestRecord } from "~/schemas/api-responses";

export function useAnalyticsSummary(period: string) {
  return useQuery({
    queryKey: queryKeys.analytics(period),
    queryFn: () =>
      apiFetch<AnalyticsResponse>(`/analytics?period=${period}`),
    refetchInterval: 30_000,
  });
}

export function useAnalyticsRequests(limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.analyticsRequests(limit),
    queryFn: () =>
      apiFetch<{ requests: RequestRecord[] }>(
        `/analytics/requests?limit=${limit}`,
      ),
    refetchInterval: 30_000,
  });
}
