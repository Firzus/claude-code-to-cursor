"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

// NEXT_PUBLIC_CONVEX_URL is only useful when the browser can directly reach
// the Convex backend — i.e. local dev (`http://127.0.0.1:3210`) or a future
// public Convex hostname. When the URL is missing or points at the docker
// DNS name (`http://convex:3210` — unreachable from a browser), we skip
// the ConvexProvider and the dashboard reads via SWR + /api/* instead.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const browserReachable =
  convexUrl !== undefined && convexUrl.length > 0 && !convexUrl.includes("://convex:");
const convex = browserReachable && convexUrl ? new ConvexReactClient(convexUrl) : null;

const swrConfig = {
  revalidateOnFocus: false,
  shouldRetryOnError: true,
  errorRetryCount: 2,
  errorRetryInterval: 2_000,
};

export function Providers({ children }: { children: ReactNode }) {
  const inner = (
    <SWRConfig value={swrConfig}>
      <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>
    </SWRConfig>
  );

  if (convex) {
    return <ConvexProvider client={convex}>{inner}</ConvexProvider>;
  }
  return inner;
}
