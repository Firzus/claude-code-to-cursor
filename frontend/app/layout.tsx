import "./globals.css";

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppShell } from "~/components/layout/app-shell";
import { Providers } from "~/components/providers";
import { Toaster } from "~/components/ui/sonner";
import { getHealth } from "~/lib/api";
import { serverEnv } from "~/lib/env";
import { fontVariables } from "~/lib/fonts";

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
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d24" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const incoming = await headers();
  const forwardedFor =
    incoming.get("cf-connecting-ip") ?? incoming.get("x-forwarded-for") ?? undefined;

  const initialHealth = await getHealth(forwardedFor).catch(() => undefined);

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
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
