"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_FAST } from "~/lib/intervals";
import { type PlanUsage, planUsageSchema } from "~/lib/schemas";

const fetcher = makeFetcher(planUsageSchema);

export function usePlanUsage(fallback?: PlanUsage) {
  return useSWR<PlanUsage>(API_ROUTES.planUsage, fetcher, {
    refreshInterval: POLL_FAST,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
