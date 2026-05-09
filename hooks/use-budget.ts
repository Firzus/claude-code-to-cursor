"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_SLOW } from "~/lib/intervals";
import { type Budget, budgetSchema } from "~/lib/schemas";

const fetcher = makeFetcher(budgetSchema);

export function useBudget(fallback?: Budget) {
  return useSWR<Budget>(API_ROUTES.budget, fetcher, {
    refreshInterval: POLL_SLOW,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
