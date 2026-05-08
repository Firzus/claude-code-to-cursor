import "server-only";

import { ConvexHttpClient } from "convex/browser";

// Self-hosted Convex deployment. The URL is also exposed publicly via
// NEXT_PUBLIC_CONVEX_URL so client components can use real-time hooks.
// Trust boundary is the docker network: port 3210 is bound to 127.0.0.1
// only, so in prod the dashboard's client-side `useQuery` hooks won't work
// from outside the host — they must round-trip through Next.js Route
// Handlers. To re-enable direct browser → Convex (for real-time updates),
// expose port 3210 via a separate Cloudflare tunnel hostname AND add a
// Convex auth provider — see `convex/auth.config.ts` (TODO).

// Lazy proxy so `next build` (which collects route metadata without env)
// doesn't trip the URL check. The throw happens on first real use.
let cached: ConvexHttpClient | null = null;

function resolveUrl(): string {
  // Server-side prefers the in-network URL (e.g. http://convex:3210 inside
  // docker), falls back to the public URL (set in dev for the browser hook).
  const url =
    process.env.CONVEX_SELF_HOSTED_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_SELF_HOSTED_URL or NEXT_PUBLIC_CONVEX_URL must be set (run `npx convex dev` once).",
    );
  }
  return url;
}

function getClient(): ConvexHttpClient {
  if (!cached) cached = new ConvexHttpClient(resolveUrl());
  return cached;
}

// Same call sites as before: `convex.query(...)`, `convex.mutation(...)`.
// The Proxy forwards every method call to a real client created on first use.
export const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, prop, receiver) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
