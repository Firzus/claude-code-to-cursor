"use client";

import useSWR from "swr";
import { makeFetcher } from "~/lib/api-client";
import { type Health, healthSchema } from "~/lib/schemas";

const fetcher = makeFetcher(healthSchema);

export function useHealth(fallback?: Health) {
  return useSWR<Health>("/api/health", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: fallback,
  });
}
