"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` once to bootstrap.");
}
const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          shouldRetryOnError: true,
          errorRetryCount: 2,
          errorRetryInterval: 2_000,
        }}
      >
        <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>
      </SWRConfig>
    </ConvexProvider>
  );
}
