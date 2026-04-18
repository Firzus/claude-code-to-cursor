import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type {
  AnalyticsErrorsResponse,
  AnalyticsResponse,
  RequestsResponse,
  TimelineResponse,
} from "~/schemas/api-responses";
import {
  analyticsErrorsResponseSchema,
  analyticsResponseSchema,
  requestsResponseSchema,
  timelineResponseSchema,
} from "~/schemas/api-responses";

export function useAnalyticsSummary(period: string) {
  return useQuery({
    queryKey: queryKeys.analytics(period),
    queryFn: () =>
      apiFetch<AnalyticsResponse>(`/analytics?period=${period}`, analyticsResponseSchema),
    refetchInterval: 30_000,
  });
}

export function useAnalyticsRequests(
  pageSize: number = 20,
  period: string = "all",
  page: number = 1,
) {
  const offset = (page - 1) * pageSize;
  return useQuery({
    queryKey: queryKeys.analyticsRequests(pageSize, period, page),
    queryFn: () =>
      apiFetch<RequestsResponse>(
        `/analytics/requests?limit=${pageSize}&offset=${offset}&period=${period}`,
        requestsResponseSchema,
      ),
    refetchInterval: 30_000,
  });
}

export function useAnalyticsTimeline(period: string) {
  return useQuery({
    queryKey: queryKeys.analyticsTimeline(period),
    queryFn: () =>
      apiFetch<TimelineResponse>(`/analytics/timeline?period=${period}`, timelineResponseSchema),
    refetchInterval: 30_000,
  });
}

export function useAnalyticsErrors(period: string, limit: number = 10) {
  return useQuery({
    queryKey: queryKeys.analyticsErrors(period),
    queryFn: () =>
      apiFetch<AnalyticsErrorsResponse>(
        `/analytics/errors?period=${period}&limit=${limit}`,
        analyticsErrorsResponseSchema,
      ),
    refetchInterval: 30_000,
  });
}
