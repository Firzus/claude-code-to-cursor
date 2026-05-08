"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type Budget, budgetSchema } from "~/lib/schemas";

const fetcher = makeFetcher(budgetSchema);

export function useBudget(fallback?: Budget) {
  return useSWR<Budget>("/api/budget", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
