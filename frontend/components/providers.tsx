"use client";

import { ThemeProvider } from "next-themes";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark"]}
    >
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
    </ThemeProvider>
  );
}
