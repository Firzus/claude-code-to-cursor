import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { BudgetResponse } from "~/schemas/api-responses";
import { budgetResponseSchema } from "~/schemas/api-responses";

export function useBudgetDay() {
  return useQuery({
    queryKey: queryKeys.budget,
    queryFn: () => apiFetch<BudgetResponse>("/budget", budgetResponseSchema),
    refetchInterval: 60_000,
  });
}
