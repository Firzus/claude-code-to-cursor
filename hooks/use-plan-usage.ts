"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type PlanUsage, planUsageSchema } from "~/lib/schemas";

const fetcher = makeFetcher(planUsageSchema);

export function usePlanUsage(fallback?: PlanUsage) {
  return useSWR<PlanUsage>("/api/plan-usage", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
