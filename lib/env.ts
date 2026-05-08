import "server-only";

const DEFAULT_INTERNAL_URL = "http://127.0.0.1:3111";

// Next.js auto-loads `.env`, `.env.local`, `.env.production` etc. from the
// project root. Since the app now lives at the repo root, the root `.env`
// (consumed by docker-compose) is also picked up by Next.js for free —
// no manual hydration needed.

function resolveInternalUrl(): string {
  const url = process.env.INTERNAL_URL ?? process.env.BACKEND_URL ?? DEFAULT_INTERNAL_URL;
  return url.replace(/\/+$/, "");
}

export const serverEnv = {
  /** Loopback URL used by RSC/Server Actions to call our own /api routes. */
  internalUrl: resolveInternalUrl(),
  settingsKey: process.env.BACKEND_SETTINGS_KEY ?? process.env.SETTINGS_API_KEY ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Claude Code to Cursor",
} as const;

export type ServerEnv = typeof serverEnv;
