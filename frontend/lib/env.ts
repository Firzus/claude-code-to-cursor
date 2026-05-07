import "server-only";

const DEFAULT_BACKEND_URL = "http://localhost:8082";

function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL ?? process.env.API_URL ?? DEFAULT_BACKEND_URL;
  return url.replace(/\/+$/, "");
}

export const serverEnv = {
  backendUrl: resolveBackendUrl(),
  settingsKey: process.env.BACKEND_SETTINGS_KEY ?? process.env.SETTINGS_API_KEY ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Claude Code to Cursor",
} as const;

export type ServerEnv = typeof serverEnv;
