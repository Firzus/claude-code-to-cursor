"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { API_ROUTES } from "~/lib/api-routes";
import { POLL_FAST } from "~/lib/intervals";
import { type Health, healthSchema } from "~/lib/schemas";

const fetcher = makeFetcher(healthSchema);

export function useHealth(fallback?: Health) {
  return useSWR<Health>(API_ROUTES.health, fetcher, {
    refreshInterval: POLL_FAST,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
