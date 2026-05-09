import "./globals.css";

import type { Metadata, Viewport } from "next";
import { AppShell } from "~/components/layout/app-shell";
import { AuroraShader } from "~/components/layout/aurora-shader";
import { Providers } from "~/components/providers";
import { Toaster } from "~/components/ui/sonner";
import { serverEnv } from "~/lib/env";
import { fontVariables } from "~/lib/fonts";

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

// The layout stays purely structural so Cache Components can pre-render the
// shell. Live data (health, plan usage, etc.) is fetched per-page or via the
// client-side SWR hooks, each wrapped in its own <Suspense> boundary.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AuroraShader />
        <Providers>
          <AppShell appName={serverEnv.appName}>{children}</AppShell>
        </Providers>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
