import "./globals.css";

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppShell } from "~/components/layout/app-shell";
import { AuroraShader } from "~/components/layout/aurora-shader";
import { Providers } from "~/components/providers";
import { Toaster } from "~/components/ui/sonner";
import { getHealth } from "~/lib/api";
import { serverEnv } from "~/lib/env";
import { fontVariables } from "~/lib/fonts";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Overview · Claude Code to Cursor",
    template: "%s · Claude Code to Cursor",
  },
  description:
    "A self-hosted proxy that routes API traffic through Claude Code's OAuth credentials.",
  applicationName: serverEnv.appName,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const forwardedFor = getForwardedFor(await headers());
  const initialHealth = await getHealth(forwardedFor).catch(() => undefined);

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AuroraShader />
        <Providers>
          <AppShell appName={serverEnv.appName} initialHealth={initialHealth}>
            {children}
          </AppShell>
        </Providers>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
