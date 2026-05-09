"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ClientApiError } from "~/lib/api-client";

// Skip retry on client errors (4xx) — these will not become OK by retrying.
// Network/5xx still retry up to `errorRetryCount` with exponential backoff.
const swrConfig = {
  revalidateOnFocus: false,
  shouldRetryOnError: true,
  errorRetryCount: 2,
  errorRetryInterval: 2_000,
  dedupingInterval: 2_000,
  onErrorRetry: (
    error: unknown,
    _key: string,
    _config: unknown,
    revalidate: (opts: { retryCount: number }) => void,
    { retryCount }: { retryCount: number },
  ) => {
    if (error instanceof ClientApiError && error.status >= 400 && error.status < 500) return;
    if (retryCount >= 2) return;
    setTimeout(() => revalidate({ retryCount }), 2_000 * 2 ** retryCount);
  },
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>
    </SWRConfig>
  );
}
