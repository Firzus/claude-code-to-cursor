import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { PlanUsageResponse } from "~/schemas/api-responses";
import { planUsageResponseSchema } from "~/schemas/api-responses";

export function usePlanUsage() {
  return useQuery({
    queryKey: queryKeys.planUsage,
    queryFn: () => apiFetch<PlanUsageResponse>("/plan-usage", planUsageResponseSchema),
    refetchInterval: 30_000,
  });
}
