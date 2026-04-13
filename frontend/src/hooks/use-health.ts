import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { HealthResponse } from "~/schemas/api-responses";
import { healthResponseSchema } from "~/schemas/api-responses";

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiFetch<HealthResponse>("/health", healthResponseSchema),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}
