import "server-only";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_BACKEND_URL = "http://localhost:8082";

// Next.js only loads `.env*` from the frontend directory, but this repo keeps
// shared config (settings key, ports, tunnel URL) in the root `.env` consumed
// by the backend and docker-compose. Mirror those into process.env at startup
// so local `next dev` doesn't need a duplicated `.env.local`.
function hydrateFromRepoRootEnv(): void {
  const cwd = process.cwd();
  // `next dev` runs with cwd = frontend/, so the repo root is one level up.
  const candidates = [resolve(cwd, "..", ".env"), resolve(dirname(cwd), ".env")];
  for (const path of candidates) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}

hydrateFromRepoRootEnv();

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
